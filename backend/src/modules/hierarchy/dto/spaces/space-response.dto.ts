import { ApiProperty } from '@nestjs/swagger';

export class SpaceResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001' })
  workspaceId!: string;

  @ApiProperty({ example: 'Product Engineering' })
  name!: string;

  @ApiProperty({ example: 'All product tasks', nullable: true })
  description!: string | null;

  @ApiProperty({ example: '#3B82F6', nullable: true })
  color!: string | null;

  @ApiProperty({ example: 'briefcase', nullable: true })
  icon!: string | null;

  @ApiProperty({ example: 'a0' })
  position!: string;

  @ApiProperty({ example: '2026-11-14T00:00:00.000Z', nullable: true })
  archivedAt!: Date | null;

  @ApiProperty({ example: '2026-11-14T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-14T00:00:00.000Z' })
  updatedAt!: Date;
}
