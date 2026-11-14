import { IsArray, IsUUID, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TaskTagsDto {
  @ApiProperty({
    description: 'Array of tag IDs to set on task (replace-set semantics, max 20, must belong to workspace)',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  tagIds!: string[];
}
