import { PrismaClient, UoMType, CompletionStatus } from "@prisma/client";

const prisma = new PrismaClient();

function deriveFiscalYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (month >= 4) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

async function main() {
  console.log("Seeding database...");

  await prisma.user.deleteMany({});

  const admin = await prisma.user.create({
    data: {
      id: "admin-001",
      email: "admin@atomquest.dev",
      name: "Admin User",
      role: "ADMIN",
    },
  });

  const manager = await prisma.user.create({
    data: {
      id: "mgr-001",
      email: "manager@atomquest.dev",
      name: "Manager L1",
      role: "MANAGER",
    },
  });

  const employee1 = await prisma.user.create({
    data: {
      id: "emp-001",
      email: "emp1@atomquest.dev",
      name: "Alice Johnson",
      role: "EMPLOYEE",
      managerId: manager.id,
    },
  });

  const employee2 = await prisma.user.create({
    data: {
      id: "emp-002",
      email: "emp2@atomquest.dev",
      name: "Bob Smith",
      role: "EMPLOYEE",
      managerId: manager.id,
    },
  });

  const fiscalYear = deriveFiscalYear(new Date(2026, 6, 15));
  const cycleYear = fiscalYear.split("-")[0];

  const goalSheet1 = await prisma.goalSheet.create({
    data: {
      userId: employee1.id,
      cycleYear,
      fiscalYear,
      quarter: "ANNUAL",
      status: "DRAFT",
      isActive: true,
    },
  });

  const priorFiscalYear = `${parseInt(cycleYear, 10) - 1}-${cycleYear}`;
  await prisma.goalSheet.create({
    data: {
      userId: employee1.id,
      cycleYear: String(parseInt(cycleYear, 10) - 1),
      fiscalYear: priorFiscalYear,
      quarter: "ANNUAL",
      status: "ARCHIVED",
      isActive: false,
    },
  });

  const goalSheet2 = await prisma.goalSheet.create({
    data: {
      userId: employee2.id,
      cycleYear,
      fiscalYear,
      quarter: "ANNUAL",
      status: "LOCKED",
      isActive: true,
    },
  });

  const goals1 = [
    {
      thrustArea: "DIGITAL_TRANSFORMATION",
      title: "Improve Code Quality",
      description: "Reduce bugs and improve test coverage",
      uomType: UoMType.MIN_NUMERIC,
      targetValue: "80",
      weightage: 25,
    },
    {
      thrustArea: "TALENT_DEVELOPMENT",
      title: "Leadership Development",
      description: "Lead 2 technical initiatives",
      uomType: UoMType.MIN_NUMERIC,
      targetValue: "2",
      weightage: 20,
    },
    {
      thrustArea: "CUSTOMER_EXPERIENCE",
      title: "Mentorship",
      description: "Mentor 2 junior developers",
      uomType: UoMType.MIN_NUMERIC,
      targetValue: "2",
      weightage: 20,
    },
    {
      thrustArea: "OPERATIONAL_EXCELLENCE",
      title: "Customer Success",
      description: "Improve customer satisfaction",
      uomType: UoMType.MIN_NUMERIC,
      targetValue: "90",
      weightage: 35,
    },
  ];

  for (const g of goals1) {
    await prisma.goal.create({
      data: {
        goalSheetId: goalSheet1.id,
        ...g,
        completionStatus: CompletionStatus.ON_TRACK,
      },
    });
  }

  await prisma.goal.create({
    data: {
      goalSheetId: goalSheet2.id,
      thrustArea: "OPERATIONAL_EXCELLENCE",
      title: "Process Documentation",
      description: "Document all internal processes",
      uomType: UoMType.MIN_NUMERIC,
      targetValue: "100",
      weightage: 30,
      completionStatus: CompletionStatus.ON_TRACK,
    },
  });

  await prisma.goal.create({
    data: {
      goalSheetId: goalSheet2.id,
      thrustArea: "DIGITAL_TRANSFORMATION",
      title: "System Performance",
      description: "Improve API response times",
      uomType: UoMType.MAX_NUMERIC,
      targetValue: "200",
      weightage: 40,
      completionStatus: CompletionStatus.ON_TRACK,
    },
  });

  await prisma.goal.create({
    data: {
      goalSheetId: goalSheet2.id,
      thrustArea: "TALENT_DEVELOPMENT",
      title: "Team Collaboration",
      description: "Improve team coordination",
      uomType: UoMType.MIN_NUMERIC,
      targetValue: "12",
      weightage: 30,
      completionStatus: CompletionStatus.NOT_STARTED,
    },
  });

  console.log("Seeding completed", { admin: admin.id, fiscalYear });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
