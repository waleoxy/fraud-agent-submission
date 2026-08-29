import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FraudAgentModule } from 'fraud-agent-core';
import { MockFraudAdapter } from './mock-fraud-adapter';
import { DemoController } from './demo.controller';

@Module({
  imports: [
    HttpModule,
    FraudAgentModule.forRoot({ adapter: MockFraudAdapter, imports: [HttpModule] }),
  ],
  controllers: [DemoController],
})
export class DemoModule {}
