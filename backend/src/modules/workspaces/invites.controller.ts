import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WorkspacesService } from './workspaces.service.js';
import { CurrentUser, type CurrentUserData } from '../../common/index.js';
import { AcceptInviteDto } from './dto/accept-invite.dto.js';

@ApiTags('invites')
@ApiBearerAuth()
@Controller('invites')
export class InvitesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a workspace invite' })
  async acceptInvite(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AcceptInviteDto,
  ) {
    return this.workspacesService.acceptInvite(dto.token, user);
  }
}
