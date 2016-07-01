/* global describe, it, beforeEach, afterEach */
'use strict';

var expect = require('chai').expect;

var Limiter = require('../lib/limiter');


describe('Limiter', () => {
    describe('#_validateRate()', () => {
        it('should parse strings as rate limits', () => {
            expect(Limiter._validateRate('1000ns')).to.equal(1);
            expect(Limiter._validateRate('2000000 ns')).to.equal(2);
            expect(Limiter._validateRate('100')).to.equal(100);
            expect(Limiter._validateRate('100ms')).to.equal(100);
            expect(Limiter._validateRate('5s')).to.equal(5000);
            expect(Limiter._validateRate('3m')).to.equal(180000);
            expect(Limiter._validateRate('4h')).to.equal(14400000);
            expect(Limiter._validateRate('5d')).to.equal(432000000);
            expect(Limiter._validateRate('6w')).to.equal(3628800000);
            expect(Limiter._validateRate.bind(null, '6x')).to.throw();
        });
    });
});
