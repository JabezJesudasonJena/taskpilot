import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../../common/index.js';

export class AuthResponseDto {
  @ApiProperty({ type: () => UserResponseDto })
  user!: UserResponseDto;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ example: 'dGhpcy1pcy1hLXJlZnJlc2gtdG9rZW4' })
  refreshToken!: string;
}
