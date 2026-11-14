import {
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  IsOptional,
  Matches,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusType } from '@prisma/client';

export class CreateStatusDto {
  @ApiProperty({ example: 'QA Testing' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @ApiPropertyOptional({ example: '#F59E0B', description: 'Hex color (#RRGGBB)' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Color must be a valid 6-digit hex code in #RRGGBB format',
  })
  color?: string;

  @ApiProperty({ enum: StatusType, example: StatusType.ACTIVE })
  @IsNotEmpty()
  @IsEnum(StatusType)
  type!: StatusType;
}
