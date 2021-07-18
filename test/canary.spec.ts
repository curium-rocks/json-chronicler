import { describe, it} from 'mocha';
import { expect } from 'chai';

describe( 'Test', function() {
    describe( 'canary()', function() {
        it( 'Should allow assertions', function() {
            expect(true).to.be.true;
        });
    });
});