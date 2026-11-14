import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderStatusDto {
  @ApiProperty({
    example: 1,
    description: '0-based index to place this status at in the list',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  toIndex!: number;
}
