import { IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MoveListDto {
  @ApiPropertyOptional({
    description: 'Target space ID if moving to a different space',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @ApiPropertyOptional({
    description:
      'Target folder ID in destination space, or null to move to space root',
    example: '123e4567-e89b-12d3-a456-426614174001',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_obj, val) => val !== null && val !== undefined)
  @IsUUID()
  folderId?: string | null;
}
