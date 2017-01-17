/* global describe, it, beforeEach, afterEach */
const expect = require('chai').expect;

const Tokens = require('../lib/tokens');


describe('Tokens', () => {
    describe('#_toDate()', () => {
        it('should check that the date is after today', () => {
            expect(Tokens._toDate.bind(null, new Date())).to.throw(Error);
        });

        it('should parse a number as timestamp', () => {
            expect(Tokens._toDate(Date.now() + 1000)).to.be.gt(Date.now());
        });

        it('should still validate number timestamps', () => {
            expect(Tokens._toDate.bind(null, Date.now())).to.throw(Error);
        });

        it('should reject unknown date formats', () => {
            expect(Tokens._toDate.bind(null, 'not a date')).to.throw(Error);
        });

        it('should parse a string as timestamp', () => {
            let date = new Date(Date.now() + 1000);
            expect(Tokens._toDate(date.toISOString())).to.be.gt(Date.now());
            expect(Tokens._toDate(date.toUTCString())).to.be.gt(Date.now());
        });
    });
});
