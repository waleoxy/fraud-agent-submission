import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FraudAgentModule } from 'fraud-agent-core';
import { HairVaultFraudAdapter } from './hairvault-fraud-adapter';

@Module({
  imports: [
    HttpModule,
    FraudAgentModule.forRoot({ adapter: HairVaultFraudAdapter, imports: [HttpModule] }),
  ],
})
export class AppModule {}
