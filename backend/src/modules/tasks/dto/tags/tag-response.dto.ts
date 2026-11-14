import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TagResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001' })
  workspaceId!: string;

  @ApiProperty({ example: 'frontend' })
  name!: string;

  @ApiPropertyOptional({ example: '#3B82F6', nullable: true })
  color!: string | null;

  @ApiProperty({ example: '2026-11-14T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-14T10:00:00.000Z' })
  updatedAt!: Date;
}
