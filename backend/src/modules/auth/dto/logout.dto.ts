import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LogoutDto {
  @ApiProperty({ example: 'dGhpcy1pcy1hLXRlc3QtcmVmcmVzaC10b2tlbg' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
