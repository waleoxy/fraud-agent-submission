import { DynamicModule, Module, ModuleMetadata, Provider, Type } from '@nestjs/common';
import { FraudAgentService } from './fraud-agent.service';
import { FraudAgentController } from './fraud-agent.controller';
import { FRAUD_AGENT_ADAPTER, FraudAgentAdapter } from './fraud-agent-adapter.interface';

/**
 * `imports` exists because the adapter is consumer-provided and its
 * constructor dependencies (HttpService, a database client, whatever a
 * given ERP integration needs) live in modules this package can't know
 * about ahead of time. Nest's module encapsulation means importing
 * HttpModule in your AppModule does NOT make HttpService visible inside
 * this dynamic module's own injector — pass it here explicitly:
 *
 *   FraudAgentModule.forRoot({ adapter: MyAdapter, imports: [HttpModule] })
 */
@Module({})
export class FraudAgentModule {
  static forRoot(options: {
    adapter: Type<FraudAgentAdapter>;
    imports?: ModuleMetadata['imports'];
  }): DynamicModule {
    const adapterProvider: Provider = {
      provide: FRAUD_AGENT_ADAPTER,
      useClass: options.adapter,
    };

    return {
      module: FraudAgentModule,
      imports: options.imports ?? [],
      controllers: [FraudAgentController],
      providers: [adapterProvider, FraudAgentService],
      exports: [FraudAgentService],
    };
  }
}
