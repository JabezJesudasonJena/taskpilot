import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsEnum,
  IsISO8601,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority } from '@prisma/client';

export class UpdateTaskDto {
  @ApiPropertyOptional({ example: 'Updated task title', minLength: 1, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description', maxLength: 50000 })
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  description?: string;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ example: '2026-11-15T09:00:00.000Z', nullable: true })
  @IsOptional()
  @IsISO8601()
  startDate?: string | null;

  @ApiPropertyOptional({ example: '2026-11-20T18:00:00.000Z', nullable: true })
  @IsOptional()
  @IsISO8601()
  dueDate?: string | null;
}
