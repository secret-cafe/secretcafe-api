import { PrismaService } from '../src/modules/prisma/prisma.service';

const prisma = new PrismaService();

async function main() {
  const roles = [
    { name: 'Super Admin', description: 'Full system access' },
    { name: 'Admin', description: 'Administrative access' },
    { name: 'Chef', description: 'Kitchen staff' },
    { name: 'Waiter', description: 'Service staff' },
    { name: 'Customer', description: 'End user' },
  ];

  for (const role of roles) {
    await prisma.roles.upsert({
      where: { name: role.name },
      update: {}, // prevents duplicate insert
      create: {
        name: role.name,
        description: role.description,
      },
    });
  }

  console.log('✅ Roles seeded successfully');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });