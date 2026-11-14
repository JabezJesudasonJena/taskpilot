import { IsArray, IsUUID, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssigneesDto {
  @ApiProperty({
    description: 'Array of user IDs to set as assignees (replace-set semantics, max 20, non-GUEST)',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  userIds!: string[];
}
