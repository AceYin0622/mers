"use strict";

var _u = require('underscore'), flatten = Function.apply.bind(Array.prototype.concat, []), slice = Function.call.bind(Array.prototype.slice),
    funcRe = /\s*function\s*.*\((.*)\).*/, paramRe = /(\/\*\$([^]*?)\$\*\/|\/\*[^]*?\*\/)?\s*([^,]*)?\s*,?\s*/g, w = require('./when'), when = w.when, promise = w.promise;

function extractArgNames(f) {
    if (!f) return [];
    paramRe.lastIndex = funcRe.lastIndex = 0;
    //javascript wtf?
    var me = funcRe.exec(f.toString())[1], match, ret = [];
    while ((match = paramRe.exec(me)) != null && (match[1] || match[2] || match[3] || match[4])) {
        ret.push(_u.compact(match.slice(2)).join('$'));
    }
    return ret;
}
function basicResolver(name) {
    return function (ctx, settings, param) {
        //does the function being resolved allow it to be?
        //obj, str, ctx, cb)
        return !settings || ( ('resolve' in settings) ? settings.resolve : true) ? ( ctx && ctx[name] || {})[param] : void(0);
    }
};


var defSettings = {
    search: ['session', 'query', 'param', 'body'],

    resolvers: {
        query: basicResolver('query'),
        session: basicResolver('session'),
        body: basicResolver('body'),
        param: basicResolver('param'),
        require: function (ctx, settings, param) {
            console.log(__dirname + '')
            var path = slice(arguments, 2).map(function (v) {
                return v ? v : '.'
            });
            var p = [], last = '';

            for (var i = 0, l = path.length; i < l; i++) {
                var c = path[i];
                if (c === '.') {
                    last += c;
                    continue;
                } else if (last) {
                    p.push(last);
                    last = '';
                }
                p.push(c);
            }
            return require(p.join('/'));
        },
        none: function () {
            return null;
        },
        any: function (ctx, settings, parts) {
            var ret = this.resolveWrap.apply(this, [settings, this.settings.search].concat(parts));

            return ret.apply(this, arguments);
        }
    }
};

function keys(obj) {
    if (Array.isArray(obj)) return obj
    if (typeof obj === 'string') return obj.split(/,\s*/);
    return Object.keys(obj);
}
function onEachResolverMap(settings, v) {
    var parts = v.split('$'), resolvers = parts.length > 1 ? [parts.shift()] : settings.search;
    return this.resolveWrap(settings, resolvers, parts);
};

var Injector = function (options) {
    options = options || {};
    this.settings = _u.extend({}, defSettings, options);
    this.resolvers = _u.extend(this.settings.resolvers, options.resolvers);
}
_u.extend(Injector.prototype, {
    split: /\/+?/gi,
    idField: '_id',
    extractArgNames: extractArgNames,

    injectArgs: function (fn, args) {
        return this.extractValues(this.extractArgNames(fn), slice(arguments, 1));
    },
    injectApply: function (fn, scope, args) {

        return fn.apply(scope, this.extractValues(this.extractArgNames(fn), slice(arguments, 2)));
    },
    /**
     * Returns an array of functions, that correspond to the resolvers.
     * @param fn
     * @param settings
     * @param args
     * @returns [function(ctx)];
     */
    extractResolvers: function invoke$extractResolvers(fn, settings) {
        settings = settings ? _u.extend({}, defSettings, fn.settings) : defSettings;
        return extractArgNames(fn).map(onEachResolverMap.bind(this, settings));
    },
    resolve: function invoke$resolve(fn, scope, ctx) {
        var api = this;
        var resolvers = this.extractResolvers(fn);

        return when(resolvers).then(function (values) {
            var args = values ? values.map(function invoke$resolve$map(f, i) {
                try {
                    var ret = f.call(api, ctx);
                } catch (e) {
                    console.log('wtf', i, e, f);
                }
                return ret;
            }) : [];

            return fn.apply(scope, args);
        }, function () {
            console.log('wtf');
        });

    },
    resolveBind: function invoke$resolveBind(fn, scope, bCtx) {
        var resolvers = this.extractResolvers(fn), api = this;
        return function invoke$resolveBind$return(ctx) {
            return fn.apply(scope, resolvers.map(function (f) {
                return f.call(api, ctx || bCtx);
            }));
        }
    },
    /**
     * It will resolve from right to left.  The first resolver to not return undefined, the value is used.   This
     * can be null.  This will be performance critical
     * @param settings
     * @param resolvers
     * @param parts
     * @returns {Function}
     */
    resolveWrap: function invoke$resolveWrap(settings, resolvers, parts) {
        var res = settings.resolvers || [], api = this, resolvers = resolvers || [];
        return function invoke$resolveWrap$return(ctx) {
            var args = [ctx, settings].concat(parts);
            for (var i = resolvers.length - 1; i > -1; i--) {
                var ret = res[resolvers[i]].apply(api, args);
                if (ret !== void(0)) {
                    return ret;
                }
            }
            //returning undefined to follow contract.
            return;
        }
    },
    extractValues: function (names, args) {
        args = flatten(slice(arguments, 1));
        var inject = _u.map(names, function (name) {
            var v = null;
            _u.each(args, function (value) {
                if (value == null) return;
                if (name in value) {
                    v = value[name];
                }
            });
            return v;
        });
        return inject;
    },
    /**
     *
     * @param fn
     * @param scope //optiona defaults to this of the func execution
     * @param args //optional
     * @returns {Function}
     */
    injectBind: function (fn, scope, args) {
        args = slice(arguments, 2);
        var names = this.extractArgNames(fn), api = this;
        return function injectArgsBind$return() {
            return fn.apply(scope || this, api.extractValues.apply(api, [names].concat(args.concat(slice(arguments)))));
        }
    },
    findById: function (obj, value) {
        var field = this.idField;
        return _u.first(_u.filter(obj, function (v) {
            return v[field] == value;
        }));
    },
    rbind: function invoke$rbind(func, args) {
        args = slice(arguments, 1);
        return function invoke$rbind$return() {
            return func.apply(this, slice(arguments).concat(args));
        };

    },
    isPromise: function (o) {
        if (o != null && typeof o !== 'string' && typeof o !== 'number')
            return typeof o.then === 'function';
        return false;
    },
    isExec: function (o) {
        if (o != null && typeof o !== 'string' && typeof o !== 'number')
            return typeof o.exec === 'function';
        return false;
    },

    invoke: function invoke(obj, str, ctx, cb) {
        if (str && _u.isString(str)) {
            str = str.split(this.split);
        }
        try {
            //sometimes it returns a promise sometimes not....

            var ret = when(this._invokeInternal(str, ctx, obj));
            if (cb)  ret.then(function invokeNoError(o) {
                if (o && o.length === 1 &&  Array.isArray(o[0])){
                    o = o[0];
                }
                return cb.apply(null, [null,o]);
            }, function invokeWithError(e, v) {
                return cb(e, v);
            });
            return ret;
        } catch (e) {
            if (cb)
                return cb(e);
            throw e;
        }
    },
    _invokeInternal: function (str, ctx, obj) {
        //Short circuit on null values.   Not an error just not anything else we can do.
        if (obj == null)
            return obj;//might be undefined.

        //Short circuit on error, won't descend on them;
        if (obj instanceof Error) {
            obj._errorPath = str.join('.');
            return obj;
        }

        var resp, current = str.shift(), bound = this._invokeInternal.bind(this, str, ctx);

        //not an object (maybe a number or bool?) nothing else we can do...
        if (!_u.isObject(obj)) {
            return str.length ? new Error("not an object and could not descend " + str) : obj;
        }
        //create a new context, so parent does not disappear in the async bits.
        ctx = _u.extend({}, ctx, {parent: obj});
        if (typeof current === 'function') {
            return this.resolve(current, obj, ctx).then(bound, bound);
        }

        if (typeof obj[current] === 'function') {
            return this.resolve(obj[current], obj, ctx).then(bound, bound);
        }
        //Duck type check for promise
        if (this.isPromise(obj)) {
            return obj.then(bound, bound);
        }

        //Check for execs.
        if (this.isExec(obj)) {
            return obj.exec(function (e, o) {
                if (e) return bound(new Error(e));
                return bound(o);
            });
        }
        //arrays an objects can be returned when there's nothing else to do.
        if (current === void(0)) {
            return obj;
        }
        if (Array.isArray(obj)) {
            //is it not an index property try finding it by id.
            if (!/^\d+?$/.test(current)) {
                var id = current;
                if (typeof obj.id === 'function') {
                    var node = obj.id(id);
                    if (node !== void(0))
                        return bound(node);
                }
            }
        }
        //Perhaps it is a property on the array 0,1,2 or anything else.
        return bound(obj[current]);

    }

});

return (module.exports = new Injector());