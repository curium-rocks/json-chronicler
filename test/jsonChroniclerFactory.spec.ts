import { describe, it} from 'mocha';
import { expect } from 'chai';
import { IChroniclerDescription, ProviderSingleton } from '@curium.rocks/data-emitter-base';
import { JsonChroniclerFactory } from '../src/jsonChroniclerFactory';
import { JsonChronicler } from '../src/jsonChronicler';

const VALID_OPTION: IChroniclerDescription = {
    name: 'test-name',
    id: 'test-id',
    type: JsonChronicler.TYPE,
    description: 'test-description',
    chroniclerProperties: {
        logName: 'test-logname',
        logDirectory: './logs',
        rotationSettings: {
            seconds: 300
        }
    }    
}
const INVALID_OPTION: IChroniclerDescription = {
    name: 'test-name',
    id: 'test-id',
    type: JsonChronicler.TYPE,
    description: 'test-description',
    chroniclerProperties: {}    
}

const FACTORY = new JsonChroniclerFactory();

describe( 'JsonChroniclerFactory', function() {
    describe( 'buildEmitter()', function() {
        it('Should build a JsonChronicler', async function() {
            const chronicler = await FACTORY.buildChronicler(VALID_OPTION);
            expect(chronicler).to.be.instanceOf(JsonChronicler);
        });
        it('Should reject invalid settings', async function() {
            let err:Error|null = null;
            try {
                await FACTORY.buildChronicler(INVALID_OPTION);
            } catch(error) {
                err = error;
            }
            expect(err).to.not.be.null;
        });
        it('Should work with the global provider', async function() {
            // register to provider
            ProviderSingleton.getInstance().registerChroniclerFactory(JsonChronicler.TYPE, FACTORY);

            // build
            const chronicler = await ProviderSingleton.getInstance().buildChronicler(VALID_OPTION);
            expect(chronicler).to.be.instanceOf(JsonChronicler);
        });
    });
});