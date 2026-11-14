import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export interface CurrentUserData {
  id: string;
  email: string;
  [key: string]: any;
}

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
