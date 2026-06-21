import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { throwBadRequestException, throwNotFoundException } from 'src/common/utils/http-exception.helper';
import { CreateTableDto, UpdateTableDto } from './dto/table.dto';
import { TableSessionDto } from './dto/table-session.dto';
import { Prisma, SessionStatus, TableStatus, TableType } from 'generated/prisma/client';
import crypto from "crypto";
import QRCode from "qrcode";
import { CloudinaryService } from 'src/common/upload/cloudinary/cloudinary.service';
import { originUrl } from 'src/common/constants/constants';

@Injectable()
export class TableService {

  constructor(private readonly prisma: PrismaService, private readonly cloudinaryService: CloudinaryService) { }

  private readonly tableSelect = {
    id: true,
    name: true,
    type: true,
    tableStatus: true,
    capacity: true,
    guestCount: true,
    enableTimeRate: true,
    ratePerMinute: true,
    chargePerPerson: true,
    qrCodeImageUrl: true,
    tableToken: true,
    isActive: true,
  } satisfies Prisma.RestaurantTableSelect;

  private response<T>(message: string, data?: T, status: boolean = true) {
    return {
      status: status,
      message,
      data,
    };
  }

  private calculateTimeCharge(session: any) {
    if (!session || !session.enableTimeRate) {
      return {
        totalMinutes: 0,
        amount: 0,
      };
    }

    const start = session.timerStartedAt || session.startedAt;
    const end = session.timerEndedAt || new Date();

    const totalMinutes = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60));

    const amount = totalMinutes * Number(session.ratePerMinute || 0) * (session.chargePerPerson ? session.guestCount : 1);

    return {
      totalMinutes,
      amount,
    };
  }

  private generateQrToken = () => crypto.randomBytes(8).toString("hex");

  private async generateQrImage(tableToken: string) {
    const frontendOriginUrl = originUrl[1];
    const qrUrl = `${frontendOriginUrl}/customer?tableToken=${tableToken}`;

    const qrImage = await QRCode.toDataURL(qrUrl);
    const uploaded = await this.cloudinaryService.uploadBase64Image(qrImage, 'QR');

    return uploaded;
  }

  public async findTableOrThrow(id: number) {
    const table = await this.prisma.restaurantTable.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: this.tableSelect,
    });

    if (!table) {
      throwNotFoundException(`Table with ID ${id} not found`);
    }

    return table;
  }

  public async findAll() {
    const tables = await this.prisma.restaurantTable.findMany({
      where: {
        deletedAt: null,
      },
      select: this.tableSelect,
      orderBy: {
        id: 'desc',
      },
    });

    return this.response(
      'Tables fetched successfully',
      tables,
    );
  }

  public async findOne(id: number) {
    const table = await this.findTableOrThrow(id);

    return this.response(
      'Table fetched successfully',
      table,
    );
  }

  public async findByType(type: TableType) {
    const tables = await this.prisma.restaurantTable.findMany({
      where: {
        type,
        deletedAt: null,
      },
      select: this.tableSelect,
    });

    return this.response(
      'Tables fetched successfully',
      tables,
    );
  }

  public async findByToken(token: string) {

    let message: string = "";
    let status: boolean = true;

    const table = await this.prisma.restaurantTable.findFirst({
      where: {
        tableToken: token,
        deletedAt: null,
      },
      select: this.tableSelect,
    });

    if (!table) {
      throwNotFoundException(`Table with ${token} not found`);
    }
    else if (table.tableStatus !== TableStatus.AVAILABLE) {
      status = false;
      message = "Table is already booked.";
    }
    else {
      message = "Tables fetched successfully";
    }

    return this.response(message, table, status);
  }

  public async create(data: CreateTableDto) {
    const tableToken = this.generateQrToken();
    const file = await this.generateQrImage(tableToken);

    const table = await this.prisma.restaurantTable.create({
      data: {
        ...data,
        tableToken: tableToken,
        qrCodeImageUrl: file?.url ?? null,
        publicId: file?.public_id ?? null,
      },
      select: this.tableSelect,
    });

    return this.response(
      'Table created successfully',
      table,
    );
  }

  public async update(id: number, data: UpdateTableDto) {
    await this.findTableOrThrow(id);

    const updatedTable = await this.prisma.restaurantTable.update({
      where: { id },
      data,
      select: this.tableSelect,
    });

    return this.response(
      'Table updated successfully',
      updatedTable,
    );
  }

  public async handleTableSession(data: TableSessionDto) {
    const tableId = data.tableId;
    const tableStatus = data.status;
    const { status, guestCount, ...tableSessionData } = data;

    const table = await this.findTableOrThrow(tableId);

    // Validate guest count against table capacity
    if (data.guestCount !== undefined && data.guestCount !== null && data.guestCount > table!.capacity) {
      throwBadRequestException(
        `Guest count (${data.guestCount}) exceeds table capacity (${table!.capacity})`
      );
    }

    if ((data.guestCount == undefined || data.guestCount == null) && tableStatus == "OCCUPIED") {
      throwBadRequestException(
        `Guest count should not be empty.`
      );
    }

    const existingSession = await this.prisma.tableSession.findFirst({
      where: {
        tableId: tableId,
        status: SessionStatus.ACTIVE,
      },
    });

    const sessionStatus = (tableStatus == "AVAILABLE" && table?.tableStatus == "RESERVED") ? SessionStatus.CANCELLED : ((tableStatus == "OCCUPIED" || tableStatus == "RESERVED") ? SessionStatus.ACTIVE : (tableStatus == "CLEANING") ? SessionStatus.CLOSED : undefined);

    if (existingSession && (tableStatus == "OCCUPIED" || tableStatus == "RESERVED" || sessionStatus == undefined)) {
      throwBadRequestException(`Table is already ${table?.tableStatus}`);
    }

    await this.prisma.restaurantTable.update({
      where: { id: tableId },
      data: {
        tableStatus: tableStatus
      }
    });

    if (sessionStatus) {
      const enableTimeRate = table?.enableTimeRate && (table.type === 'POD' || table.type === 'HALL');

      if (!existingSession) {
        await this.prisma.tableSession.create({
          data: {
            ...tableSessionData,
            guestCount: guestCount,
            status: sessionStatus,
            startedAt: new Date(),
            timerStartedAt: enableTimeRate ? new Date() : null,
            enableTimeRate: enableTimeRate,
            ratePerMinute: table?.ratePerMinute,
            chargePerPerson: table?.chargePerPerson,
          },
        });

        await this.prisma.restaurantTable.update({
          where: { id: tableId },
          data: {
            guestCount: guestCount
          }
        });
      }
      else {
        const billing = this.calculateTimeCharge(existingSession);

        await this.prisma.tableSession.update({
          where: { id: existingSession.id },
          data: {
            ...tableSessionData,
            status: sessionStatus,
            endedAt: sessionStatus === 'CLOSED' ? new Date() : null,
            timerEndedAt: (sessionStatus === 'CLOSED' && enableTimeRate) ? new Date() : null,
            totalMinutes: (sessionStatus === 'CLOSED' && billing?.totalMinutes !== 0) ? billing?.totalMinutes : null,
            timeChargeAmount: (sessionStatus === 'CLOSED' && billing?.amount !== 0) ? billing?.amount : null,
          },
        });

        if (tableStatus == "CLEANING") {
          await this.prisma.restaurantTable.update({
            where: { id: tableId },
            data: {
              guestCount: 0
            }
          });
        }
      }
    }

    return this.response(
      `Table ${tableStatus} successfull`,
      {
        status: tableStatus
      }
    );
  }

  public async getLiveCharge(tableId: number) {
    const session = await this.prisma.tableSession.findFirst({
      where: {
        tableId: tableId,
        status: SessionStatus.ACTIVE,
      },
    });

    const billing = this.calculateTimeCharge(session);

    return {
      totalMinutes: billing.totalMinutes,
      currentCharge: billing.amount,
    };
  }

  public async delete(id: number) {
    await this.findTableOrThrow(id);

    await this.prisma.restaurantTable.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    return this.response(
      'Table deleted successfully',
    );
  }
}