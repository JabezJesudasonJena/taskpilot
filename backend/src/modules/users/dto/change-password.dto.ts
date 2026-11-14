import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'currentPassword123' })
  @IsString()
  currentPassword!: string;

  @ApiProperty({ example: 'newPassword123' })
  @IsString()
  @Length(8, 128)
  newPassword!: string;
}
