import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: '01a1d4fb-6318-7c53-b5b0-ebb3449ba892' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'Jane Doe' })
  name!: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png', nullable: true })
  avatarUrl!: string | null;

  @ApiPropertyOptional({ example: '2026-11-13T12:00:00.000Z', nullable: true })
  emailVerifiedAt!: Date | null;

  @ApiProperty({ example: '2026-11-13T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-13T12:00:00.000Z' })
  updatedAt!: Date;

  static fromEntity(user: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string | null;
    emailVerifiedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.name = user.name;
    dto.avatarUrl = user.avatarUrl ?? null;
    dto.emailVerifiedAt = user.emailVerifiedAt ?? null;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
