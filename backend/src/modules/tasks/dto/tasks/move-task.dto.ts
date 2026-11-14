import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MoveTaskDto {
  @ApiPropertyOptional({
    description: 'Target list ID (cross-list move; top-level tasks only)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  listId?: string;

  @ApiPropertyOptional({
    description: 'Target status ID in the target list',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsOptional()
  @IsUUID()
  statusId?: string;

  @ApiPropertyOptional({
    description: 'Preceding sibling task ID for fractional positioning',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @IsOptional()
  @IsUUID()
  prevId?: string;

  @ApiPropertyOptional({
    description: 'Succeeding sibling task ID for fractional positioning',
    example: '123e4567-e89b-12d3-a456-426614174003',
  })
  @IsOptional()
  @IsUUID()
  nextId?: string;
}
