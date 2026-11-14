import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptInviteDto {
  @ApiProperty({
    example: 'dGhpcy1pcy1hLXJhbmRvbS1vcGFxdWUtdG9rZW4',
    description: 'Invite token received in the invitation email',
  })
  @IsNotEmpty()
  @IsString()
  token!: string;
}
