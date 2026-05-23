import { Global, Module } from '@nestjs/common';
import { WaService } from './wa.service';
import { WaController } from './wa.controller';

// Global so domain modules (votes, scheduler, outbox) can inject WaService.
@Global()
@Module({
  providers: [WaService],
  controllers: [WaController],
  exports: [WaService],
})
export class WaModule {}
