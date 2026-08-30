import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  throwBadRequestException,
  throwNotFoundException,
} from 'src/common/utils/http-exception.helper';
import { _tableStatus, CreateTableDto, QueryTableDto, UpdateTableDto } from './dto/table.dto';
import { TableSessionDto } from './dto/table-session.dto';
import {
  Prisma,
  SessionStatus,
  TableStatus,
  TableType,
  PaymentStatus,
  OrderStatus,
} from 'generated/prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import QRCode from 'qrcode';
import { CloudinaryService } from 'src/common/upload/cloudinary/cloudinary.service';
import { originUrl } from 'src/common/constants/constants';

/**
 * Input accepted by session/live-charge flows.
 * Public API sends the UUID `tableId` (string); internal callers (e.g. billing)
 * pass the internal numeric id.
 */
type TableIdInput = string | number;

type TableSessionInput = Omit<TableSessionDto, 'tableId'> & {
  tableId: TableIdInput;
};

@Injectable()
export class TableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) { }

  private readonly tableSelect = {
    tableId: true,
    name: true,
    type: true,
    tableStatus: true,
    capacity: true,
    guestCount: true,
    enableTimeRate: true,
    ratePerMinute: true,
    ratePerHour: true,
    chargePerPerson: true,
    rushMode: true,
    qrCodeImageUrl: true,
    tableToken: true,
    publicId: true,
    isActive: true,
    createdAt: true,
  } satisfies Prisma.RestaurantTableSelect;

  private response<T>(message: string, data?: T, status: boolean = true) {
    return {
      status: status,
      message,
      data,
    };
  }

  /**
   * Keep the response key `id` but its value is the UUID `tableId`.
   * The internal numeric auto-increment `id` is never exposed.
   */
  private mapTable(table: any): any {
    if (!table) return table;
    const { tableId, ...rest } = table;
    return { id: tableId, ...rest };
  }

  /**
   * Resolve a public table UUID into the internal numeric table id.
   */
  private async resolveInternalIdOrThrow(tableId: string): Promise<number> {
    const table = await this.prisma.restaurantTable.findFirst({
      where: {
        tableId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!table) throwNotFoundException(`Table with ID ${tableId} not found`);
    return table!.id;
  }

  private calculateTimeCharge(session: any) {
    if (!session || !session.enableTimeRate || session.rushMode) {
      return {
        totalMinutes: 0,
        amount: 0,
      };
    }

    const start = session.timerStartedAt || session.startedAt;
    const end = session.timerEndedAt || new Date();

    const totalMinutes = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60),
    );
    const multiplier = session.chargePerPerson ? session.guestCount : 1;

    let amount: number;

    // HALL tables: use ratePerHour if available
    if (session.ratePerHour) {
      const elapsedHours = totalMinutes / 60;
      amount = elapsedHours * Number(session.ratePerHour) * multiplier;
    } else {
      // POD tables: use ratePerMinute
      amount = totalMinutes * Number(session.ratePerMinute || 0) * multiplier;
    }

    return {
      totalMinutes,
      amount,
    };
  }

  private async generateQrImage(tableToken: string) {
    const frontendOriginUrl = originUrl[0];
    const qrUrl = `${frontendOriginUrl}/customer?tableToken=${tableToken}`;

    const qrImage = await QRCode.toDataURL(qrUrl);
    const uploaded = await this.cloudinaryService.uploadBase64Image(
      qrImage,
      'QR',
    );

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

  public async findAll(query: QueryTableDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const status = query?.status;
    const ignorePagination = status === _tableStatus.ALL;

    const where: Prisma.RestaurantTableWhereInput = {
      deletedAt: null,
      ...(query.type && { type: query.type }),
      ...((status === _tableStatus.ACTIVE || status === _tableStatus.INACTIVE) && {
        isActive: status === _tableStatus.ACTIVE,
      }),
    };

    const [tables, total] = await this.prisma.$transaction([
      this.prisma.restaurantTable.findMany({
        where,
        select: this.tableSelect,
        orderBy: { createdAt: 'desc' },
        ...(ignorePagination ? {} : { skip, take: limit }),
      }),
      this.prisma.restaurantTable.count({ where }),
    ]);

    return {
      status: true,
      message: 'Tables fetched successfully',
      data: tables.map((table) => this.mapTable(table)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public async findOne(tableId: string) {
    const internalId = await this.resolveInternalIdOrThrow(tableId);
    const table = await this.findTableOrThrow(internalId);

    return this.response('Table fetched successfully', this.mapTable(table));
  }

  public async findByToken(token: string) {
    let message: string = '';
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
    } else if (table.tableStatus !== TableStatus.AVAILABLE) {
      status = false;
      message = 'Table is already booked.';
    } else {
      message = 'Tables fetched successfully';
    }

    return this.response(message, this.mapTable(table), status);
  }

  public async create(data: CreateTableDto, createdById?: number) {
    const tableToken = this.generateQrToken();
    const file = await this.generateQrImage(tableToken);

    const table = await this.prisma.restaurantTable.create({
      data: {
        ...data,
        tableId: randomUUID(),
        tableToken: tableToken,
        qrCodeImageUrl: file?.url ?? null,
        publicId: file?.public_id ?? null,
        createdBy: createdById ?? null,
      },
      select: this.tableSelect,
    });

    return this.response('Table created successfully');
  }

  public async update(
    tableId: string,
    data: UpdateTableDto,
    updatedById?: number,
  ) {
    const internalId = await this.resolveInternalIdOrThrow(tableId);
    const { regenerateQr, ...tableData } = data;

    // Fetch existing table (includes publicId for Cloudinary deletion)
    const existingTable = await this.findTableOrThrow(internalId);
    if (!existingTable) return;

    const updatePayload: any = { ...tableData, updatedBy: updatedById ?? null };

    // If regenerateQr flag is true, generate new token + QR and delete old ones
    if (regenerateQr) {
      // Delete old QR image from Cloudinary if it exists
      if (existingTable.publicId) {
        await this.cloudinaryService.deleteFile(existingTable.publicId);
      }

      // Generate new token and QR image
      const newToken = this.generateQrToken();
      const file = await this.generateQrImage(newToken);

      updatePayload.tableToken = newToken;
      updatePayload.qrCodeImageUrl = file?.url ?? null;
      updatePayload.publicId = file?.public_id ?? null;
    }

    await this.prisma.restaurantTable.update({
      where: { id: internalId },
      data: updatePayload,
    });

    return this.response('Table updated successfully');
  }

  public async handleTableSession(data: TableSessionInput) {
    const tableId =
      typeof data.tableId === 'number'
        ? data.tableId
        : await this.resolveInternalIdOrThrow(data.tableId);
    const tableStatus = data.status;
    const guestCount = data.guestCount ?? 0;
    const tableSessionData = data.notes ? { notes: data.notes } : {};

    const table = await this.findTableOrThrow(tableId);

    // Validate guest count against table capacity
    if (
      data.guestCount !== undefined &&
      data.guestCount !== null &&
      data.guestCount > table!.capacity
    ) {
      throwBadRequestException(
        `Guest count (${data.guestCount}) exceeds table capacity (${table!.capacity})`,
      );
    }

    if (
      (data.guestCount == undefined || data.guestCount == null) &&
      tableStatus == 'OCCUPIED'
    ) {
      throwBadRequestException(`Guest count should not be empty.`);
    }

    const existingSession = await this.prisma.tableSession.findFirst({
      where: {
        tableId: tableId,
        status: SessionStatus.ACTIVE,
      },
    });

    const sessionStatus =
      tableStatus == 'AVAILABLE' && table?.tableStatus == 'RESERVED'
        ? SessionStatus.CANCELLED
        : tableStatus == 'OCCUPIED' || tableStatus == 'RESERVED'
          ? SessionStatus.ACTIVE
          : tableStatus == 'CLEANING'
            ? SessionStatus.CLOSED
            : undefined;

    if (
      existingSession &&
      (tableStatus == 'OCCUPIED' ||
        tableStatus == 'RESERVED' ||
        sessionStatus == undefined)
    ) {
      throwBadRequestException(`Table is already ${table?.tableStatus}`);
    }

    // For CLEANING status: validate no active orders AND no unpaid bills,
    // then perform all updates atomically within a transaction.
    if (existingSession && tableStatus == 'CLEANING') {
      // Validate no active orders exist on this table
      const existingOrder = await this.prisma.order.findFirst({
        where: {
          tableId: tableId,
          status: {
            notIn: [OrderStatus.CANCELLED, OrderStatus.COMPLETED],
          },
        },
      });

      if (existingOrder) {
        throwBadRequestException(
          `Cannot set table to ${tableStatus}. Active orders exist.`,
        );
      }

      // For POD/HALL time-rate tables without an order, enforce that a bill
      // has been generated (prevents skipping billing for time-only charges).
      if (
        !existingOrder &&
        (table?.type === TableType.POD || table?.type === TableType.HALL)
      ) {
        const anyBill = await this.prisma.billing.findFirst({
          where: { sessionId: existingSession.id },
        });

        if (!anyBill) {
          throwBadRequestException(
            `Cannot close table. A bill must be generated first for ${table?.type} tables.`,
          );
        }
      }

      // Validate no unpaid bills exist for this session
      const unpaidBill = await this.prisma.billing.findFirst({
        where: {
          sessionId: existingSession.id,
          paymentStatus: {
            notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED],
          },
        },
      });

      if (unpaidBill) {
        throwBadRequestException(
          `Cannot close table. Unpaid bill (${unpaidBill.billNumber}) exists. Please complete payment first.`,
        );
      }

      // Perform all updates atomically
      const enableTimeRate =
        !table?.rushMode &&
        table?.enableTimeRate &&
        (table.type === 'POD' || table.type === 'HALL');
      const billing = this.calculateTimeCharge(existingSession);

      await this.prisma.$transaction(async (tx) => {
        // Update session to CLOSED with time charge calculation
        await tx.tableSession.update({
          where: { id: existingSession.id },
          data: {
            ...tableSessionData,
            status: SessionStatus.CLOSED,
            endedAt: new Date(),
            timerEndedAt: enableTimeRate ? new Date() : null,
            totalMinutes:
              enableTimeRate && billing?.totalMinutes !== 0
                ? billing?.totalMinutes
                : null,
            timeChargeAmount:
              enableTimeRate && billing?.amount !== 0 ? billing?.amount : null,
          },
        });

        // Update table to CLEANING and reset guest count
        await tx.restaurantTable.update({
          where: { id: tableId },
          data: {
            tableStatus: TableStatus.CLEANING,
            guestCount: 0,
          },
        });
      });

      return this.response(`Table cleaning successfully`, {
        status: tableStatus,
      });
    }

    // For CANCELLED status: validate and update atomically
    if (existingSession && sessionStatus == SessionStatus.CANCELLED) {
      const existingOrder = await this.prisma.order.findFirst({
        where: {
          tableId: tableId,
          status: {
            notIn: [OrderStatus.CANCELLED, OrderStatus.COMPLETED],
          },
        },
      });

      if (existingOrder) {
        throwBadRequestException(`Cannot cancel session. Active orders exist.`);
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.tableSession.update({
          where: { id: existingSession.id },
          data: { status: SessionStatus.CANCELLED },
        });

        await tx.restaurantTable.update({
          where: { id: tableId },
          data: { tableStatus: TableStatus.AVAILABLE },
        });
      });

      return this.response(`Session cancelled successfully`, {
        status: 'AVAILABLE',
      });
    }

    // For AVAILABLE status: simply update the table (no session changes needed)
    if (tableStatus == 'AVAILABLE') {
      await this.prisma.restaurantTable.update({
        where: { id: tableId },
        data: { tableStatus: TableStatus.AVAILABLE },
      });

      return this.response(`Table is now available`, { status: 'AVAILABLE' });
    }

    // For new session creation (OCCUPIED/RESERVED): perform atomically
    if (tableStatus == 'OCCUPIED' || tableStatus == 'RESERVED') {
      const enableTimeRate =
        table?.enableTimeRate &&
        (table.type === 'POD' || table.type === 'HALL');

      await this.prisma.$transaction(async (tx) => {
        await tx.restaurantTable.update({
          where: { id: tableId },
          data: {
            tableStatus: tableStatus as TableStatus,
            guestCount: guestCount,
          },
        });

        await tx.tableSession.create({
          data: {
            ...tableSessionData,
            tableId: tableId,
            guestCount: guestCount,
            status: SessionStatus.ACTIVE,
            startedAt: new Date(),
            timerStartedAt: enableTimeRate ? new Date() : null,
            enableTimeRate: enableTimeRate,
            ratePerMinute: table?.ratePerMinute,
            ratePerHour: table?.ratePerHour,
            chargePerPerson: table?.chargePerPerson,
            rushMode: table?.rushMode ?? false,
          },
        });
      });

      return this.response(`Table ${tableStatus} successfully`, {
        status: tableStatus,
      });
    }

    return this.response(`Table status updated to ${tableStatus}`, {
      status: tableStatus,
    });
  }

  public async getLiveCharge(tableId: TableIdInput) {
    const internalId =
      typeof tableId === 'number'
        ? tableId
        : await this.resolveInternalIdOrThrow(tableId);
    const session = await this.prisma.tableSession.findFirst({
      where: {
        tableId: internalId,
        status: SessionStatus.ACTIVE,
      },
    });

    const billing = this.calculateTimeCharge(session);

    return {
      totalMinutes: billing.totalMinutes,
      currentCharge: billing.amount,
    };
  }

  public async delete(tableId: string, updatedById?: number) {
    const internalId = await this.resolveInternalIdOrThrow(tableId);
    await this.findTableOrThrow(internalId);

    await this.prisma.restaurantTable.update({
      where: { id: internalId },
      data: {
        deletedAt: new Date(),
        updatedBy: updatedById ?? null,
      },
    });

    return this.response('Table deleted successfully');
  }

  private generateQrToken = () => randomBytes(8).toString('hex');
}
