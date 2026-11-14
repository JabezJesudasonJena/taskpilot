import {
  IsString,
  MaxLength,
  MinLength,
  IsOptional,
  Matches,
  IsEnum,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatusType } from '@prisma/client';

export class UpdateStatusDto {
  @ApiPropertyOptional({ example: 'QA & Review' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ example: '#F59E0B', description: 'Hex color (#RRGGBB)' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Color must be a valid 6-digit hex code in #RRGGBB format',
  })
  color?: string;

  @ApiPropertyOptional({ enum: StatusType, example: StatusType.ACTIVE })
  @IsOptional()
  @IsEnum(StatusType)
  type?: StatusType;
}
