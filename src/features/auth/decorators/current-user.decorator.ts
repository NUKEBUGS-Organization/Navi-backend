import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../user.entity';

export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext): Partial<User> | unknown => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (data) {
      return user?.[data];
    }
    return user;
  },
);
