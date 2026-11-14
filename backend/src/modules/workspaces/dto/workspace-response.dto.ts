import { ApiProperty } from '@nestjs/swagger';
import { WorkspaceRole } from '@prisma/client';

export class WorkspaceResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'Acme Corp' })
  name!: string;

  @ApiProperty({ example: 'acme-corp' })
  slug!: string;

  @ApiProperty({ enum: WorkspaceRole, example: WorkspaceRole.OWNER })
  role!: WorkspaceRole;

  @ApiProperty({ example: '2026-11-14T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-14T00:00:00.000Z' })
  updatedAt!: Date;
}
