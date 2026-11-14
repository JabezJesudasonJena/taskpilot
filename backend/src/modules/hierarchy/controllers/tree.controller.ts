import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WorkspaceRole } from '@prisma/client';
import { WorkspaceRoles } from '../../workspaces/index.js';
import { TreeService } from '../services/tree.service.js';
import { IncludeArchivedQueryDto } from '../dto/common/include-archived-query.dto.js';

@ApiTags('hierarchy')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/hierarchy')
export class TreeController {
  constructor(private readonly treeService: TreeService) {}

  @Get()
  @WorkspaceRoles(WorkspaceRole.GUEST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get full hierarchy tree of spaces, folders and lists (minRole: GUEST)',
  })
  async getTree(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: IncludeArchivedQueryDto,
  ) {
    return this.treeService.getTree(workspaceId, query.includeArchived);
  }
}
