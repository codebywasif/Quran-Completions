import { Module } from '@nestjs/common';
import { VoteModule } from '../vote/vote.module';
import { OutboxService } from './outbox.service';
import { OutboxController } from './outbox.controller';

@Module({
  imports: [VoteModule],
  providers: [OutboxService],
  controllers: [OutboxController],
  exports: [OutboxService],
})
export class OutboxModule {}
