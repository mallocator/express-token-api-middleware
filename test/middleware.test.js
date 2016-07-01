/* global describe, it, beforeEach, afterEach */
'use strict';

var crypto = require('crypto');

var async = require('async');
var expect = require('chai').expect;
var express = require('express');
var request = require('supertest');

var middleware = require('..');

describe('middleware', () => {
    it('should create a basic token for authentication', done => {
        var app = express();
        var tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => {
            expect(req.user.id).to.equal('test');
            res.end();
        });

        var token = tokenManager.getToken({
            id: 'test'
        });

        request(app).get('/test').set('Authorization', token).expect(200).end(done);
    });

    it('should create a token that is limited to a request path', done => {
        var app = express();
        var tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => res.end());
        app.get('/secure', (req, res) => res.end());

        var token = tokenManager.getToken({
            id: 'test',
            path: /^\/secure.*/
        });

        async.parallel([
            cb => request(app).get('/test').set('Authorization', token).expect(403, cb),
            cb => request(app).get('/secure').expect(401, cb),
            cb => request(app).get('/secure').set('Authorization', 'wrong').expect(403, cb),
            cb => request(app).get('/secure').set('Authorization', token).expect(200, cb)
        ], done);
    });

    it('should create a token that is rate limited', done => {
        var app = express();
        var tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => {
            res.end();
        });

        var token = tokenManager.getToken({
            id: 'test',
            rate: '100ms'
        });

        var token2 = tokenManager.getToken({
            id: 'test2',
            rate: '100ms'
        });

        var start = process.hrtime();
        async.parallel([
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb),
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb),
            cb => request(app).get('/test').set('Authorization', token2).expect(200, cb)
        ], err => {
            var elapsed = process.hrtime(start);
            var ms = (elapsed[0] * 1e9 + elapsed[1]) / 1000000;
            expect(ms).to.be.gt(100);
            expect(ms).to.be.lt(150);
            done(err);
        })
    });

    it('should rate limit while being manually notified', done => {
        var app = express();
        var tokenManager = middleware({
            password: 'test',
            salt: crypto.randomBytes(16)
        });
        app.use(tokenManager);
        app.get('/test', (req, res) => {
            res.end();
        });

        var user = {
            id: 'test',
            rate: '100ms'
        };
        var token = tokenManager.getToken(user);

        var start = process.hrtime();
        async.series([
            cb => {
                tokenManager.notify(user);
                cb();
            },
            cb => request(app).get('/test').set('Authorization', token).expect(200, cb)
        ], err => {
            var elapsed = process.hrtime(start);
            var ms = (elapsed[0] * 1e9 + elapsed[1]) / 1000000;
            expect(ms).to.be.gt(100);
            expect(ms).to.be.lt(150);
            done(err);
        })
    });
});
