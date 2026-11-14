import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferOwnershipDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Target member user ID to receive ownership',
  })
  @IsNotEmpty()
  @IsUUID()
  userId!: string;
}
