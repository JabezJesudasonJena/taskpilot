import { ApiProperty } from '@nestjs/swagger';
import { StatusType } from '@prisma/client';

export class StatusResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001' })
  workspaceId!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174002' })
  listId!: string;

  @ApiProperty({ example: 'In Progress' })
  name!: string;

  @ApiProperty({ example: '#3B82F6', nullable: true })
  color!: string | null;

  @ApiProperty({ enum: StatusType, example: StatusType.ACTIVE })
  type!: StatusType;

  @ApiProperty({ example: 1 })
  position!: number;

  @ApiProperty({ example: '2026-11-14T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-14T00:00:00.000Z' })
  updatedAt!: Date;
}
