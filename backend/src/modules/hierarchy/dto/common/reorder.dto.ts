import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReorderDto {
  @ApiPropertyOptional({
    description: 'ID of sibling item directly preceding the new position',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  prevId?: string;

  @ApiPropertyOptional({
    description: 'ID of sibling item directly succeeding the new position',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsOptional()
  @IsUUID()
  nextId?: string;
}
