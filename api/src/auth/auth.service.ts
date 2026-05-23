import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly username: string;
  private readonly passwordHash: string;

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    this.username = config.get<string>('ADMIN_USERNAME') ?? 'admin';
    const hash = config.get<string>('ADMIN_PASSWORD_HASH');
    if (hash && hash.trim().length > 0) {
      this.passwordHash = hash;
    } else {
      const plain = config.get<string>('ADMIN_PASSWORD') ?? 'change-me';
      this.passwordHash = bcrypt.hashSync(plain, 10);
      if (plain === 'change-me') {
        this.logger.warn(
          'ADMIN_PASSWORD is the default "change-me" — set a real password!',
        );
      }
    }
  }

  async login(
    username: string,
    password: string,
  ): Promise<{ token: string; username: string }> {
    const ok =
      username === this.username &&
      (await bcrypt.compare(password, this.passwordHash));
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const token = await this.jwt.signAsync({ sub: username, role: 'moderator' });
    return { token, username };
  }
}
