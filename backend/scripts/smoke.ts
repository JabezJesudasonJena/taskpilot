import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  WorkspaceRole,
  StatusType,
  ActivityEntityType,
  ActivityAction,
} from '@prisma/client';

async function runSmokeTest() {
  const prisma = new PrismaService();
  await prisma.$connect();
  console.log('--- Starting Smoke Test ---');

  const timestamp = Date.now();
  const testEmail1 = `smoke_user1_${timestamp}@example.com`;
  const testEmail2 = `smoke_user2_${timestamp}@example.com`;
  const testSlug = `smoke-ws-${timestamp}`;

  try {
    // 1. Create User 1
    console.log('Creating User 1...');
    const user1 = await prisma.user.create({
      data: {
        email: testEmail1,
        passwordHash: 'dummy_hash_for_smoke_test',
        name: 'Smoke Test User 1',
      },
    });
    console.log(`Created User 1: ${user1.id} (${user1.email})`);

    // 2. Create User 2 (for second OWNER test)
    console.log('Creating User 2 (for second OWNER test)...');
    const user2 = await prisma.user.create({
      data: {
        email: testEmail2,
        passwordHash: 'dummy_hash_for_smoke_test',
        name: 'Smoke Test User 2',
      },
    });
    console.log(`Created User 2: ${user2.id} (${user2.email})`);

    // 3. Create Workspace
    console.log('Creating Workspace...');
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Smoke Test Workspace',
        slug: testSlug,
      },
    });
    console.log(`Created Workspace: ${workspace.id} (${workspace.slug})`);

    // 4. Create WorkspaceMember (User 1 as OWNER)
    console.log('Creating WorkspaceMember (User 1 as OWNER)...');
    const member1 = await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user1.id,
        role: WorkspaceRole.OWNER,
      },
    });
    console.log(`Created WorkspaceMember: ${member1.id} (role: ${member1.role})`);

    // 5. Test unique partial index: second OWNER in same workspace must be rejected
    console.log('Verifying second OWNER in same workspace is rejected by unique index...');
    let rejected = false;
    try {
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user2.id,
          role: WorkspaceRole.OWNER,
        },
      });
    } catch (error: any) {
      rejected = true;
      console.log('Second OWNER was rejected as expected!');
      console.log(`Error code: ${error.code}`);
    }

    if (!rejected) {
      throw new Error('FAILED: Second OWNER was not rejected by workspace_one_owner_idx!');
    }

    // 6. Create Space
    console.log('Creating Space...');
    const space = await prisma.space.create({
      data: {
        workspaceId: workspace.id,
        name: 'Smoke Space',
        position: 'a0',
      },
    });
    console.log(`Created Space: ${space.id}`);

    // 7. Create List
    console.log('Creating List...');
    const list = await prisma.list.create({
      data: {
        workspaceId: workspace.id,
        spaceId: space.id,
        name: 'Smoke List',
        position: 'a0',
      },
    });
    console.log(`Created List: ${list.id}`);

    // 8. Create Status
    console.log('Creating Status...');
    const status = await prisma.status.create({
      data: {
        workspaceId: workspace.id,
        listId: list.id,
        name: 'To Do',
        type: StatusType.OPEN,
        position: 1,
      },
    });
    console.log(`Created Status: ${status.id}`);

    // 9. Create Task
    console.log('Creating Task...');
    const task = await prisma.task.create({
      data: {
        workspaceId: workspace.id,
        listId: list.id,
        statusId: status.id,
        creatorId: user1.id,
        title: 'Smoke Test Task',
        description: 'Verifying full text search and relation querying',
        position: 'a0',
      },
    });
    console.log(`Created Task: ${task.id}`);

    // 10. Create Comment
    console.log('Creating Comment...');
    const comment = await prisma.comment.create({
      data: {
        workspaceId: workspace.id,
        taskId: task.id,
        authorId: user1.id,
        body: 'Smoke test comment body',
      },
    });
    console.log(`Created Comment: ${comment.id}`);

    // 11. Create ActivityLog
    console.log('Creating ActivityLog...');
    const log = await prisma.activityLog.create({
      data: {
        workspaceId: workspace.id,
        taskId: task.id,
        actorId: user1.id,
        entityType: ActivityEntityType.TASK,
        entityId: task.id,
        action: ActivityAction.CREATED,
        metadata: { title: task.title },
      },
    });
    console.log(`Created ActivityLog: ${log.id}`);

    // 12. Read them back with relations
    console.log('Reading them back with relations...');
    const fetchedWorkspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspace.id },
      include: {
        members: { include: { user: true } },
        spaces: {
          include: {
            lists: {
              include: {
                statuses: true,
                tasks: {
                  include: {
                    comments: { include: { author: true } },
                    activityLogs: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    console.log('Relations verified successfully:');
    console.log(`- Workspace: ${fetchedWorkspace.name} (${fetchedWorkspace.slug})`);
    console.log(`  - Members count: ${fetchedWorkspace.members.length}`);
    console.log(`  - Member 0: ${fetchedWorkspace.members[0].user.name} (${fetchedWorkspace.members[0].role})`);
    console.log(`  - Space: ${fetchedWorkspace.spaces[0].name}`);
    console.log(`  - List: ${fetchedWorkspace.spaces[0].lists[0].name}`);
    console.log(`  - Status: ${fetchedWorkspace.spaces[0].lists[0].statuses[0].name}`);
    console.log(`  - Task: ${fetchedWorkspace.spaces[0].lists[0].tasks[0].title}`);
    console.log(`  - Comment: ${fetchedWorkspace.spaces[0].lists[0].tasks[0].comments[0].body}`);
    console.log(`  - ActivityLogs: ${fetchedWorkspace.spaces[0].lists[0].tasks[0].activityLogs.length}`);

    // 13. Cleanup: delete everything created
    console.log('Cleaning up smoke test data...');
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.user.delete({ where: { id: user1.id } });
    await prisma.user.delete({ where: { id: user2.id } });
    console.log('All smoke test data deleted successfully.');

    console.log('--- Smoke Test Passed Completely! ---');
  } finally {
    await prisma.$disconnect();
  }
}

runSmokeTest().catch((err) => {
  console.error('Smoke test failed with error:', err);
  process.exit(1);
});
