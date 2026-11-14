import { ApiProperty } from '@nestjs/swagger';
import { TaskResponseDto } from './task-response.dto.js';

export class PaginatedTasksResponseDto {
  @ApiProperty({ type: [TaskResponseDto] })
  items!: TaskResponseDto[];

  @ApiProperty({
    nullable: true,
    example: 'eyJ0IjoidGFzayIsImsiOiIyMDI2LTExLTE0VDAwOjAwOjAwLjAwMFoiLCJpZCI6Ii4uLiJ9',
  })
  nextCursor!: string | null;
}
