import { ApiProperty } from '@nestjs/swagger';

export class TreeListDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'Backend Roadmap' })
  name!: string;

  @ApiProperty({ example: '#3B82F6', nullable: true })
  color!: string | null;

  @ApiProperty({ example: 'a0' })
  position!: string;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174001',
    nullable: true,
  })
  folderId!: string | null;

  @ApiProperty({ example: '2026-11-14T00:00:00.000Z', nullable: true })
  archivedAt!: Date | null;
}

export class TreeFolderDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001' })
  spaceId!: string;

  @ApiProperty({ example: 'Sprint 24' })
  name!: string;

  @ApiProperty({ example: '#3B82F6', nullable: true })
  color!: string | null;

  @ApiProperty({ example: 'a0' })
  position!: string;

  @ApiProperty({ example: '2026-11-14T00:00:00.000Z', nullable: true })
  archivedAt!: Date | null;

  @ApiProperty({ type: () => [TreeListDto] })
  lists!: TreeListDto[];
}

export class TreeSpaceDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'Product Engineering' })
  name!: string;

  @ApiProperty({ example: 'All product roadmaps', nullable: true })
  description!: string | null;

  @ApiProperty({ example: '#3B82F6', nullable: true })
  color!: string | null;

  @ApiProperty({ example: 'briefcase', nullable: true })
  icon!: string | null;

  @ApiProperty({ example: 'a0' })
  position!: string;

  @ApiProperty({ example: '2026-11-14T00:00:00.000Z', nullable: true })
  archivedAt!: Date | null;

  @ApiProperty({ type: () => [TreeListDto] })
  lists!: TreeListDto[];

  @ApiProperty({ type: () => [TreeFolderDto] })
  folders!: TreeFolderDto[];
}

export class HierarchyTreeResponseDto {
  @ApiProperty({ type: () => [TreeSpaceDto] })
  spaces!: TreeSpaceDto[];
}
