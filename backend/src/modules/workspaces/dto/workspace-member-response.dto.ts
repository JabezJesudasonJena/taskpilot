import { ApiProperty } from '@nestjs/swagger';
import { WorkspaceRole } from '@prisma/client';

export class WorkspaceMemberResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'Workspace member ID' })
  id!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001', description: 'User ID' })
  userId!: string;

  @ApiProperty({ example: 'Alice Smith' })
  name!: string;

  @ApiProperty({ example: 'https://example.com/avatar.png', nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ example: 'alice@example.com' })
  email!: string;

  @ApiProperty({ enum: WorkspaceRole, example: WorkspaceRole.MEMBER })
  role!: WorkspaceRole;

  @ApiProperty({ example: '2026-11-14T00:00:00.000Z' })
  joinedAt!: Date;
}
