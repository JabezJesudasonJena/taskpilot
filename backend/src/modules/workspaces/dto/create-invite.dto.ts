import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WorkspaceRole } from '@prisma/client';

export class CreateInviteDto {
  @ApiProperty({
    example: 'invitee@example.com',
    description: 'Email address of the person to invite',
  })
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @ApiProperty({
    enum: WorkspaceRole,
    example: WorkspaceRole.MEMBER,
    description: 'Workspace role to grant upon acceptance (cannot be OWNER)',
  })
  @IsNotEmpty()
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}
