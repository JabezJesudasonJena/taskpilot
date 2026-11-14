import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WorkspaceRole } from '@prisma/client';

export class ChangeMemberRoleDto {
  @ApiProperty({
    enum: WorkspaceRole,
    example: WorkspaceRole.ADMIN,
    description: 'New role for the workspace member (cannot be OWNER)',
  })
  @IsNotEmpty()
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}
