(function($) {
	
	var Channel = Base.inherit({
		name : "",
		_has : function(method) {
			return this.hasOwnProperty(method)
		},
		onRecieve : null,
		onSubscribe : null,
		onUnsubscribe :null,
		onDisconnect : null, 
		onError : null
	});
	
	window.RT = Base.inherit({
	    debugging: true,
	    plugins: {},
	    channels : {},
	    socket: null,
	    channelMethods: {},
	    identity: null,
	    notifyOpen: false,
	    options: {
	    	subscription : [],
	        strip: /<[^>]*>/gi,
	        htmlEntities: true,
	        dateFormat: "longTime",
	        daysToSave: 1,
	        port: 8001,
	        resource: "realtime",
	        channelsCookie: "realTime_channels",
	        identityCookie: "realTime_identity",
	        server: "localhost"
	    },
	    connect: function(options) {
	        var connected = RT._connect(options);
	    },
	    _connect: function(options) {
	    	
	    	// self var for JS's crazy scope
	    	var self = this;
	    	
	    	// extend 2 levels deep our options
	        for (i in options) {
	            if (typeof options[i] == "object") {
	                for (j in options[i]) this.options[i][j] = options[i][j];
	            } else {
	                this.options[i] = options[i];
	            }
	        }
	        
	        // set identity on root
	        this.identity = this.options.identity || "";
	    	
	        // create and connect new socket
	        this.socket = new io.Socket(this.options.server, {
	            port: this.options.port,
	            rememberTransport: false,
	            resource: this.options.resource
	        }).connect();
	        
			// the above connect() calls this event
	        this.socket.addEvent('connect', function() {
	            
	            // send init
	            this.send({
	                type: "command",
	                identity: self.identity,
	                data: {
	                    command: "init",
	                    options: {
	                        channels: self.options.subscription
	                    }
	                }
	            });
	            
	            // after init, we can subscribe
	            self.subscribe(self.options.subscription);
	            
	        });
	        
	        
	        // whenever socketIO tells us something
	        this.socket.addEvent('message', function(json) {
	        	
	        	// make sure we've got JSON
	            if (typeof(json) != "object") json = JSON.parse(json);
				
				// if we have an error, throw it
	            if(json.error) throw(json.error);
	            
	            // the date comes in in a stupid format
	            json.timestamp = self.formatDate(json.timestamp);
				
				if(typeof self.channels[json.channel] == "undefined") {
					throw(json.type+" received on channel ["+json.channel+"] that is not defined");
				}
				
				
				var channel = self.channels[json.channel];
				switch(json.type) {
					case "command":
						var command = json.data.command;
						
						self.debug("Incoming Command",command,json.channel);
						
						if(channel._has(command)) {
							channel[command](json);
						} else {
							self.debug("Channel ["+channel.name+"] does not have command ["+command+"] defined");
						}
						
						break;
					case "message":
						
						self.debug("Incoming Message",json,json.channel);
						
						if(channel._has("onReceive")) {
							// make it easier to access msg
							json.msg = json.data.msg;
							// call onReceive
							channel.onReceive(json);
						} else {
							throw("onReceive not being handled on Channel ["+channel.name+"]");
						}
						break;
					default:
						break;
				}
				
	        });
	    },
	  	subscribe: function(channels,userData) {
	        
	        // make sure we have an array to use
	        if (typeof(channels) == "string") {
	            channels = new Array(channels);
	        }
	        
	        // send subscribe per each channel
	        for (i in channels) {
                this.socket.send({
                    type: "command",
                    channel: channels[i],
                    data: {
                        command: "subscribe",
                        options: userData
                    }
                });
	        }
	    },
	    unsubscribe: function(channels) {
	        if (typeof(channels) == "string") {
	            channels = new Array(channels);
	        }
	        for (i in channels) {
	            var channel = channels[i];
	            this.debug("Subscription: ", channel);
	            this.socket.send({
	                type: "command",
	                channel: channel,
	                data: {
	                    command: "unsubscribe"
	                }
	            });
	            this.unSaveChannel(channel);
	        }
	    },
	    publish: function(channel, msg) {
	    	
	    	// connect if not connect?
	        if (!this.socket) this.connect();
	        
	        // if our channel isn't defined, throw error
	        if (!this.channels[channel]) {
	            throw("Cannot publish. Channel ["+channel+"] not created");
	        }
	        
	        // publish message
	        this.socket.send({
	            type: "message",
	            channel: channel,
	            data: {
	                msg: msg
	            }
	        });
	        
	    },
	    createChannel: function(channel, methods) {
	    	
	    	// all options are on root level for Channel
	    	var options = methods;
	    	options.name = channel;
	    	
	    	// create an instance of a channel
	    	this.channels[channel] = Channel.inherit(options);
	    	
	    	/*
	        this.channelMethods[channel] = methods;
	        this.channelMethods[channel]["_hasMethod"] = function(method) {
	            return typeof(this[method]) == "function"
	        }
	        this.channelMethods[channel]["_triggerEvent"] = function(event, options) {
	            this.triggerEvent(channel, event, options);
	        }
	        this.debug("Creating Channel: ", channel)
	        */
	    },
	    triggerEvent: function(channel, event, options) {
	        this.debug("triggerEvent: ", event);
	        this.socket.send({
	            type: "command",
	            channel: channel,
	            data: {
	                command: event,
	                options: options
	            }
	        });
	    },
	    debug: function() {
	        if(typeof window.console != "undefined") {
	        	var args = Array.prototype.slice.call(arguments);
	        	console.log(args);
	        }
	        
	    },
	    formatDate: function(timestamp) {
	        if (this.options.dateFormat) {
	            var d = new Date(Date(timestamp));
	            return d.format(this.options.dateFormat);
	        } else {
	            return timestamp;
	        }
	    },
	    addMessageEvent: function(channel, callback) {
	        this.socket.addEvent('message', function(json) {
	            if (typeof(json) != "object") json = JSON.parse(json);
	            if (json.type == "message" && json.channel == channel) {
	                json.timestamp = RT.formatDate(json.timestamp);
	                callback(json);
	            }
	        })
	    },
	    addCommandEvent: function(channel, command, callback) {
	        this.socket.addEvent('message', function(json) {
	            if (typeof(json) != "object") json = JSON.parse(json);
	            if (json.type == "command" && json.data.command == command && json.channel == channel) {
	                json.timestamp = RT.formatDate(json.timestamp);
	                callback(json);
	            }
	        })
	    }
	});
})(window.jQuery);

function setCookie(c_name, value, exdays) {
    var exdate = new Date();
    exdate.setDate(exdate.getDate() + exdays);
    var c_value = escape(value) + ((exdays == null) ? "" : "; expires=" + exdate.toUTCString());
    document.cookie = c_name + "=" + c_value;
}

function getCookie(c_name) {
    var i, x, y, ARRcookies = document.cookie.split(";");
    for (i = 0; i < ARRcookies.length; i++) {
        x = ARRcookies[i].substr(0, ARRcookies[i].indexOf("="));
        y = ARRcookies[i].substr(ARRcookies[i].indexOf("=") + 1);
        x = x.replace(/^\s+|\s+$/g, "");
        if (x == c_name) {
            return unescape(y);
        }
    }
}

function inArray(needle, haystack, argStrict) {
    var key = '',
        strict = !! argStrict;
    if (strict) {
        for (key in haystack) {
            if (haystack[key] === needle) return true;
        }
    } else {
        for (key in haystack) {
            if (haystack[key] == needle) return true;
        }
    }
    return false;
}

function loadScript(url, callback) {
    var script = document.createElement("script")
    script.type = "text/javascript";
    if (script.readyState) {
        script.onreadystatechange = function() {
            if (script.readyState == "loaded" || script.readyState == "complete") {
                script.onreadystatechange = null;
                callback();
            }
        };
    } else {
        script.onload = function() {
            callback();
        };
    }
    script.src = url;
    document.getElementsByTagName("head")[0].appendChild(script);
}
var dateFormat = function() {
    var token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|"[^"]*"|'[^']*'/g,
        timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g,
        timezoneClip = /[^-+\dA-Z]/g,
        pad = function(val, len) {
            val = String(val);
            len = len || 2;
            while (val.length < len) val = "0" + val;
            return val;
        };
    return function(date, mask, utc) {
        var dF = dateFormat;
        if (arguments.length == 1 && Object.prototype.toString.call(date) == "[object String]" && !/\d/.test(date)) {
            mask = date;
            date = undefined;
        }
        date = date ? new Date(date) : new Date;
        if (isNaN(date)) throw SyntaxError("invalid date");
        mask = String(dF.masks[mask] || mask || dF.masks["default"]);
        if (mask.slice(0, 4) == "UTC:") {
            mask = mask.slice(4);
            utc = true;
        }
        var _ = utc ? "getUTC" : "get",
            d = date[_ + "Date"](),
            D = date[_ + "Day"](),
            m = date[_ + "Month"](),
            y = date[_ + "FullYear"](),
            H = date[_ + "Hours"](),
            M = date[_ + "Minutes"](),
            s = date[_ + "Seconds"](),
            L = date[_ + "Milliseconds"](),
            o = utc ? 0 : date.getTimezoneOffset(),
            flags = {
                d: d,
                dd: pad(d),
                ddd: dF.i18n.dayNames[D],
                dddd: dF.i18n.dayNames[D + 7],
                m: m + 1,
                mm: pad(m + 1),
                mmm: dF.i18n.monthNames[m],
                mmmm: dF.i18n.monthNames[m + 12],
                yy: String(y).slice(2),
                yyyy: y,
                h: H % 12 || 12,
                hh: pad(H % 12 || 12),
                H: H,
                HH: pad(H),
                M: M,
                MM: pad(M),
                s: s,
                ss: pad(s),
                l: pad(L, 3),
                L: pad(L > 99 ? Math.round(L / 10) : L),
                t: H < 12 ? "a" : "p",
                tt: H < 12 ? "am" : "pm",
                T: H < 12 ? "A" : "P",
                TT: H < 12 ? "AM" : "PM",
                Z: utc ? "UTC" : (String(date).match(timezone) || [""]).pop().replace(timezoneClip, ""),
                o: (o > 0 ? "-" : "+") + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
                S: ["th", "st", "nd", "rd"][d % 10 > 3 ? 0 : (d % 100 - d % 10 != 10) * d % 10]
            };
        return mask.replace(token, function($0) {
            return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
        });
    };
}();
dateFormat.masks = {
    "default": "ddd mmm dd yyyy HH:MM:ss",
    shortDate: "m/d/yy",
    mediumDate: "mmm d, yyyy",
    longDate: "mmmm d, yyyy",
    fullDate: "dddd, mmmm d, yyyy",
    shortTime: "h:MM TT",
    mediumTime: "h:MM:ss TT",
    longTime: "h:MM:ss TT Z",
    isoDate: "yyyy-mm-dd",
    isoTime: "HH:MM:ss",
    isoDateTime: "yyyy-mm-dd'T'HH:MM:ss",
    isoUtcDateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'"
};
dateFormat.i18n = {
    dayNames: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    monthNames: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
};
Date.prototype.format = function(mask, utc) {
    return dateFormat(this, mask, utc);
};

WEB_SOCKET_SWF_LOCATION = "WebSocketMain.swf";

/* Socket.IO.min 0.6.3 @author Guillermo Rauch <guillermo@learnboost.com>, @license The MIT license., @copyright Copyright (c) 2010 LearnBoost <dev@learnboost.com> */
var io=this.io={version:"0.6.3",setPath:function(a){window.console&&console.error&&console.error("io.setPath will be removed. Please set the variable WEB_SOCKET_SWF_LOCATION pointing to WebSocketMain.swf"),this.path=/\/$/.test(a)?a:a+"/",WEB_SOCKET_SWF_LOCATION=a+"lib/vendor/web-socket-js/WebSocketMain.swf"}};"jQuery"in this&&(jQuery.io=this.io),typeof window!="undefined"&&typeof WEB_SOCKET_SWF_LOCATION=="undefined"&&(WEB_SOCKET_SWF_LOCATION="/socket.io/lib/vendor/web-socket-js/WebSocketMain.swf"),function(){var a=this.io,b=!1;a.util={load:function(a){if(/loaded|complete/.test(document.readyState)||b)return a();"attachEvent"in window?window.attachEvent("onload",a):window.addEventListener("load",a,!1)},defer:function(b){if(!a.util.webkit)return b();a.util.load(function(){setTimeout(b,100)})},inherit:function(a,b){for(var c in b.prototype)a.prototype[c]=b.prototype[c]},indexOf:function(a,b,c){for(var d=a.length,e=c<0?Math.max(0,d+c):c||0;e<d;e++)if(a[e]===b)return e;return-1},isArray:function(a){return Object.prototype.toString.call(a)==="[object Array]"},merge:function(a,b){for(var c in b)b.hasOwnProperty(c)&&(a[c]=b[c])}},a.util.webkit=/webkit/i.test(navigator.userAgent),a.util.load(function(){b=!0})}(),function(){var a=this.io,b="~m~",c=function(a){if(Object.prototype.toString.call(a)=="[object Object]"){if(!("JSON"in window)){var b="Socket.IO Error: Trying to encode as JSON, but JSON.stringify is missing.";if("console"in window&&console.error)console.error(b);else throw new Error(b);return'{ "$error": "'+b+'" }'}return"~j~"+JSON.stringify(a)}return String(a)},d=a.Transport=function(b,c){this.base=b,this.options={timeout:15e3},a.util.merge(this.options,c)};d.prototype.send=function(){throw new Error("Missing send() implementation")},d.prototype.connect=function(){throw new Error("Missing connect() implementation")},d.prototype.disconnect=function(){throw new Error("Missing disconnect() implementation")},d.prototype.encode=function(d){var e="",f;d=a.util.isArray(d)?d:[d];for(var g=0,h=d.length;g<h;g++)f=d[g]===null||d[g]===undefined?"":c(d[g]),e+=b+f.length+b+f;return e},d.prototype.decode=function(a){var c=[],d,e;do{if(a.substr(0,3)!==b)return c;a=a.substr(3),d="",e="";for(var f=0,g=a.length;f<g;f++){e=Number(a.substr(f,1));if(a.substr(f,1)==e)d+=e;else{a=a.substr(d.length+b.length),d=Number(d);break}}c.push(a.substr(0,d)),a=a.substr(d)}while(a!=="");return c},d.prototype.onData=function(a){this.setTimeout();var b=this.decode(a);if(b&&b.length)for(var c=0,d=b.length;c<d;c++)this.onMessage(b[c])},d.prototype.setTimeout=function(){var a=this;this.timeout&&clearTimeout(this.timeout),this.timeout=setTimeout(function(){a.onTimeout()},this.options.timeout)},d.prototype.onTimeout=function(){this.onDisconnect()},d.prototype.onMessage=function(a){this.sessionid?a.substr(0,3)=="~h~"?this.onHeartbeat(a.substr(3)):a.substr(0,3)=="~j~"?this.base.onMessage(JSON.parse(a.substr(3))):this.base.onMessage(a):(this.sessionid=a,this.onConnect())},d.prototype.onHeartbeat=function(a){this.send("~h~"+a)},d.prototype.onConnect=function(){this.connected=!0,this.connecting=!1,this.base.onConnect(),this.setTimeout()},d.prototype.onDisconnect=function(){this.connecting=!1,this.connected=!1,this.sessionid=null,this.base.onDisconnect()},d.prototype.prepareUrl=function(){return(this.base.options.secure?"https":"http")+"://"+this.base.host+":"+this.base.options.port+"/"+this.base.options.resource+"/"+this.type+(this.sessionid?"/"+this.sessionid:"/")}}(),function(){var a=this.io,b=new Function,c=function(){if(!("XMLHttpRequest"in window))return!1;var a=new XMLHttpRequest;return a.withCredentials!=undefined}(),d=function(a){if("XDomainRequest"in window&&a)return new XDomainRequest;if("XMLHttpRequest"in window&&(!a||c))return new XMLHttpRequest;if(!a){try{var b=new ActiveXObject("MSXML2.XMLHTTP");return b}catch(d){}try{var e=new ActiveXObject("Microsoft.XMLHTTP");return e}catch(d){}}return!1},e=a.Transport.XHR=function(){a.Transport.apply(this,arguments),this.sendBuffer=[]};a.util.inherit(e,a.Transport),e.prototype.connect=function(){this.get();return this},e.prototype.checkSend=function(){if(!this.posting&&this.sendBuffer.length){var a=this.encode(this.sendBuffer);this.sendBuffer=[],this.sendIORequest(a)}},e.prototype.send=function(b){a.util.isArray(b)?this.sendBuffer.push.apply(this.sendBuffer,b):this.sendBuffer.push(b),this.checkSend();return this},e.prototype.sendIORequest=function(a){var c=this;this.posting=!0,this.sendXHR=this.request("send","POST"),this.sendXHR.onreadystatechange=function(){var a;if(c.sendXHR.readyState==4){c.sendXHR.onreadystatechange=b;try{a=c.sendXHR.status}catch(d){}c.posting=!1,a==200?c.checkSend():c.onDisconnect()}},this.sendXHR.send("data="+encodeURIComponent(a))},e.prototype.disconnect=function(){this.onDisconnect();return this},e.prototype.onDisconnect=function(){if(this.xhr){this.xhr.onreadystatechange=b;try{this.xhr.abort()}catch(c){}this.xhr=null}if(this.sendXHR){this.sendXHR.onreadystatechange=b;try{this.sendXHR.abort()}catch(c){}this.sendXHR=null}this.sendBuffer=[],a.Transport.prototype.onDisconnect.call(this)},e.prototype.request=function(a,b,c){var e=d(this.base.isXDomain());c&&(e.multipart=!0),e.open(b||"GET",this.prepareUrl()+(a?"/"+a:"")),b=="POST"&&"setRequestHeader"in e&&e.setRequestHeader("Content-type","application/x-www-form-urlencoded; charset=utf-8");return e},e.check=function(a){try{if(d(a))return!0}catch(b){}return!1},e.xdomainCheck=function(){return e.check(!0)},e.request=d}(),function(){var a=this.io,b=a.Transport.websocket=function(){a.Transport.apply(this,arguments)};a.util.inherit(b,a.Transport),b.prototype.type="websocket",b.prototype.connect=function(){var a=this;this.socket=new WebSocket(this.prepareUrl()),this.socket.onmessage=function(b){a.onData(b.data)},this.socket.onclose=function(b){a.onDisconnect()},this.socket.onerror=function(b){a.onError(b)};return this},b.prototype.send=function(a){this.socket&&this.socket.send(this.encode(a));return this},b.prototype.disconnect=function(){this.socket&&this.socket.close();return this},b.prototype.onError=function(a){this.base.emit("error",[a])},b.prototype.prepareUrl=function(){return(this.base.options.secure?"wss":"ws")+"://"+this.base.host+":"+this.base.options.port+"/"+this.base.options.resource+"/"+this.type+(this.sessionid?"/"+this.sessionid:"")},b.check=function(){return"WebSocket"in window&&WebSocket.prototype&&WebSocket.prototype.send&&!!WebSocket.prototype.send.toString().match(/native/i)&&typeof WebSocket!="undefined"},b.xdomainCheck=function(){return!0}}(),function(){var a=this.io,b=a.Transport.flashsocket=function(){a.Transport.websocket.apply(this,arguments)};a.util.inherit(b,a.Transport.websocket),b.prototype.type="flashsocket",b.prototype.connect=function(){var b=this,c=arguments;WebSocket.__addTask(function(){a.Transport.websocket.prototype.connect.apply(b,c)});return this},b.prototype.send=function(){var b=this,c=arguments;WebSocket.__addTask(function(){a.Transport.websocket.prototype.send.apply(b,c)});return this},b.check=function(){if(typeof WebSocket=="undefined"||!("__addTask"in WebSocket)||!swfobject)return!1;return swfobject.hasFlashPlayerVersion("10.0.0")},b.xdomainCheck=function(){return!0}}(),function(){var a=this.io,b=a.Transport.htmlfile=function(){a.Transport.XHR.apply(this,arguments)};a.util.inherit(b,a.Transport.XHR),b.prototype.type="htmlfile",b.prototype.get=function(){var a=this;this.open(),window.attachEvent("onunload",function(){a.destroy()})},b.prototype.open=function(){this.doc=new ActiveXObject("htmlfile"),this.doc.open(),this.doc.write("<html></html>"),this.doc.parentWindow.s=this,this.doc.close();var a=this.doc.createElement("div");this.doc.body.appendChild(a),this.iframe=this.doc.createElement("iframe"),a.appendChild(this.iframe),this.iframe.src=this.prepareUrl()+"/"+ +(new Date)},b.prototype._=function(a,b){this.onData(a);var c=b.getElementsByTagName("script")[0];c.parentNode.removeChild(c)},b.prototype.destroy=function(){if(this.iframe){try{this.iframe.src="about:blank"}catch(a){}this.doc=null,CollectGarbage()}},b.prototype.disconnect=function(){this.destroy();return a.Transport.XHR.prototype.disconnect.call(this)},b.check=function(){if("ActiveXObject"in window)try{var b=new ActiveXObject("htmlfile");return b&&a.Transport.XHR.check()}catch(c){}return!1},b.xdomainCheck=function(){return!1}}(),function(){var a=this.io,b=a.Transport["xhr-multipart"]=function(){a.Transport.XHR.apply(this,arguments)};a.util.inherit(b,a.Transport.XHR),b.prototype.type="xhr-multipart",b.prototype.get=function(){var a=this;this.xhr=this.request("","GET",!0),this.xhr.onreadystatechange=function(){a.xhr.readyState==4&&a.onData(a.xhr.responseText)},this.xhr.send(null)},b.check=function(){return"XMLHttpRequest"in window&&"prototype"in XMLHttpRequest&&"multipart"in XMLHttpRequest.prototype},b.xdomainCheck=function(){return!0}}(),function(){var a=this.io,b=new Function,c=a.Transport["xhr-polling"]=function(){a.Transport.XHR.apply(this,arguments)};a.util.inherit(c,a.Transport.XHR),c.prototype.type="xhr-polling",c.prototype.connect=function(){var b=this;a.util.defer(function(){a.Transport.XHR.prototype.connect.call(b)});return!1},c.prototype.get=function(){var a=this;this.xhr=this.request(+(new Date),"GET"),this.xhr.onreadystatechange=function(){var c;if(a.xhr.readyState==4){a.xhr.onreadystatechange=b;try{c=a.xhr.status}catch(d){}c==200?(a.onData(a.xhr.responseText),a.get()):a.onDisconnect()}},this.xhr.send(null)},c.check=function(){return a.Transport.XHR.check()},c.xdomainCheck=function(){return a.Transport.XHR.xdomainCheck()}}(),function(){var a=this.io,b=a.Transport["jsonp-polling"]=function(){a.Transport.XHR.apply(this,arguments),this.insertAt=document.getElementsByTagName("head")[0],this.index=a.JSONP.length,a.JSONP.push(this)};a.util.inherit(b,a.Transport["xhr-polling"]),a.JSONP=[],b.prototype.type="jsonp-polling",b.prototype.sendIORequest=function(a){function h(){b.iframe&&b.form.removeChild(b.iframe);try{f=document.createElement('<iframe name="'+b.iframeId+'">')}catch(a){f=document.createElement("iframe"),f.name=b.iframeId}f.id=b.iframeId,b.form.appendChild(f),b.iframe=f}function g(){h(),b.posting=!1,b.checkSend()}var b=this;if(!("form"in this)){var c=document.createElement("FORM"),d=document.createElement("TEXTAREA"),e=this.iframeId="socket_io_iframe_"+this.index,f;c.style.position="absolute",c.style.top="-1000px",c.style.left="-1000px",c.target=e,c.method="POST",c.action=this.prepareUrl()+"/"+ +(new Date)+"/"+this.index,d.name="data",c.appendChild(d),this.insertAt.insertBefore(c,null),document.body.appendChild(c),this.form=c,this.area=d}h(),this.posting=!0,this.area.value=a;try{this.form.submit()}catch(i){}this.iframe.attachEvent?f.onreadystatechange=function(){b.iframe.readyState=="complete"&&g()}:this.iframe.onload=g},b.prototype.get=function(){var a=this,b=document.createElement("SCRIPT");this.script&&(this.script.parentNode.removeChild(this.script),this.script=null),b.async=!0,b.src=this.prepareUrl()+"/"+ +(new Date)+"/"+this.index,b.onerror=function(){a.onDisconnect()},this.insertAt.insertBefore(b,null),this.script=b},b.prototype._=function(){this.onData.apply(this,arguments),this.get();return this},b.check=function(){return!0},b.xdomainCheck=function(){return!0}}(),function(){var a=this.io,b=a.Socket=function(b,c){this.host=b||document.domain,this.options={secure:!1,document:document,port:document.location.port||80,resource:"socket.io",transports:["websocket","flashsocket","htmlfile","xhr-multipart","xhr-polling","jsonp-polling"],transportOptions:{"xhr-polling":{timeout:25e3},"jsonp-polling":{timeout:25e3}},connectTimeout:5e3,tryTransportsOnConnectTimeout:!0,reconnect:!0,reconnectionDelay:500,maxReconnectionAttempts:10,rememberTransport:!0},a.util.merge(this.options,c),this.connected=!1,this.connecting=!1,this.reconnecting=!1,this.events={},this.transport=this.getTransport(),!this.transport&&"console"in window&&console.error("No transport available")};b.prototype.getTransport=function(b){var c=b||this.options.transports,d;this.options.rememberTransport&&!b&&(d=this.options.document.cookie.match("(?:^|;)\\s*socketio=([^;]*)"),d&&(this.rememberedTransport=!0,c=[decodeURIComponent(d[1])]));for(var e=0,f;f=c[e];e++)if(a.Transport[f]&&a.Transport[f].check()&&(!this.isXDomain()||a.Transport[f].xdomainCheck()))return new a.Transport[f](this,this.options.transportOptions[f]||{});return null},b.prototype.connect=function(a){if(this.transport&&!this.connected){this.connecting&&this.disconnect(!0),this.connecting=!0,this.emit("connecting",[this.transport.type]),this.transport.connect();if(this.options.connectTimeout){var b=this;this.connectTimeoutTimer=setTimeout(function(){if(!b.connected){b.disconnect(!0);if(b.options.tryTransportsOnConnectTimeout&&!b.rememberedTransport){b.remainingTransports||(b.remainingTransports=b.options.transports.slice(0));var a=b.remainingTransports;while(a.length>0&&a.splice(0,1)[0]!=b.transport.type);a.length&&(b.transport=b.getTransport(a),b.connect())}(!b.remainingTransports||b.remainingTransports.length==0)&&b.emit("connect_failed")}b.remainingTransports&&b.remainingTransports.length==0&&delete b.remainingTransports},this.options.connectTimeout)}}a&&typeof a=="function"&&this.once("connect",a);return this},b.prototype.send=function(a){if(!this.transport||!this.transport.connected)return this.queue(a);this.transport.send(a);return this},b.prototype.disconnect=function(a){this.connectTimeoutTimer&&clearTimeout(this.connectTimeoutTimer),a||(this.options.reconnect=!1),this.transport.disconnect();return this},b.prototype.on=function(a,b){a in this.events||(this.events[a]=[]),this.events[a].push(b);return this},b.prototype.once=function(a,b){var c=this,d=function(){c.removeEvent(a,d),b.apply(c,arguments)};d.ref=b,c.on(a,d);return this},b.prototype.emit=function(a,b){if(a in this.events){var c=this.events[a].concat();for(var d=0,e=c.length;d<e;d++)c[d].apply(this,b===undefined?[]:b)}return this},b.prototype.removeEvent=function(a,b){if(a in this.events)for(var c=0,d=this.events[a].length;c<d;c++)(this.events[a][c]==b||this.events[a][c].ref&&this.events[a][c].ref==b)&&this.events[a].splice(c,1);return this},b.prototype.queue=function(a){"queueStack"in this||(this.queueStack=[]),this.queueStack.push(a);return this},b.prototype.doQueue=function(){if(!("queueStack"in this)||!this.queueStack.length)return this;this.transport.send(this.queueStack),this.queueStack=[];return this},b.prototype.isXDomain=function(){var a=window.location.port||80;return this.host!==document.domain||this.options.port!=a},b.prototype.onConnect=function(){this.connected=!0,this.connecting=!1,this.doQueue(),this.options.rememberTransport&&(this.options.document.cookie="socketio="+encodeURIComponent(this.transport.type)),this.emit("connect")},b.prototype.onMessage=function(a){this.emit("message",[a])},b.prototype.onDisconnect=function(){var a=this.connected;this.connected=!1,this.connecting=!1,this.queueStack=[],a&&(this.emit("disconnect"),this.options.reconnect&&!this.reconnecting&&this.onReconnect())},b.prototype.onReconnect=function(){function e(){if(!!a.reconnecting)if(!a.connected){if(a.connecting&&a.reconnecting)return a.reconnectionTimer=setTimeout(e,1e3);a.reconnectionAttempts++>=a.options.maxReconnectionAttempts?a.redoTransports?(a.emit("reconnect_failed"),d()):(a.on("connect_failed",e),a.options.tryTransportsOnConnectTimeout=!0,a.transport=a.getTransport(a.options.transports),a.redoTransports=!0,a.connect()):(a.reconnectionDelay*=2,a.connect(),a.emit("reconnecting",[a.reconnectionDelay,a.reconnectionAttempts]),a.reconnectionTimer=setTimeout(e,a.reconnectionDelay))}else d()}function d(){a.connected&&a.emit("reconnect",[a.transport.type,a.reconnectionAttempts]),a.removeEvent("connect_failed",e).removeEvent("connect",e),a.reconnecting=!1,delete a.reconnectionAttempts,delete a.reconnectionDelay,delete a.reconnectionTimer,delete a.redoTransports,a.options.tryTransportsOnConnectTimeout=b,a.options.rememberTransport=c;return}this.reconnecting=!0,this.reconnectionAttempts=0,this.reconnectionDelay=this.options.reconnectionDelay;var a=this,b=this.options.tryTransportsOnConnectTimeout,c=this.options.rememberTransport;this.options.tryTransportsOnConnectTimeout=!1,this.reconnectionTimer=setTimeout(e,this.reconnectionDelay),this.on("connect",e)},b.prototype.fire=b.prototype.emit,b.prototype.addListener=b.prototype.addEvent=b.prototype.addEventListener=b.prototype.on,b.prototype.removeListener=b.prototype.removeEventListener=b.prototype.removeEvent}();var swfobject=function(){function V(b){var c=/[\\\"<>\.;]/,d=c.exec(b)!=null;return d&&typeof encodeURIComponent!=a?encodeURIComponent(b):b}function U(a,b){if(!!x){var c=b?"visible":"hidden";t&&P(a)?P(a).style.visibility=c:T("#"+a,"visibility:"+c)}}function T(c,d,e,f){if(!y.ie||!y.mac){var g=i.getElementsByTagName("head")[0];if(!g)return;var h=e&&typeof e=="string"?e:"screen";f&&(v=null,w=null);if(!v||w!=h){var j=Q("style");j.setAttribute("type","text/css"),j.setAttribute("media",h),v=g.appendChild(j),y.ie&&y.win&&typeof i.styleSheets!=a&&i.styleSheets.length>0&&(v=i.styleSheets[i.styleSheets.length-1]),w=h}y.ie&&y.win?v&&typeof v.addRule==b&&v.addRule(c,d):v&&typeof i.createTextNode!=a&&v.appendChild(i.createTextNode(c+" {"+d+"}"))}}function S(a){var b=y.pv,c=a.split(".");c[0]=parseInt(c[0],10),c[1]=parseInt(c[1],10)||0,c[2]=parseInt(c[2],10)||0;return b[0]>c[0]||b[0]==c[0]&&b[1]>c[1]||b[0]==c[0]&&b[1]==c[1]&&b[2]>=c[2]?!0:!1}function R(a,b,c){a.attachEvent(b,c),o[o.length]=[a,b,c]}function Q(a){return i.createElement(a)}function P(a){var b=null;try{b=i.getElementById(a)}catch(c){}return b}function O(a){var b=P(a);if(b){for(var c in b)typeof b[c]=="function"&&(b[c]=null);b.parentNode.removeChild(b)}}function N(a){var b=P(a);b&&b.nodeName=="OBJECT"&&(y.ie&&y.win?(b.style.display="none",function(){b.readyState==4?O(a):setTimeout(arguments.callee,10)}()):b.parentNode.removeChild(b))}function M(a,b,c){var d=Q("param");d.setAttribute("name",b),d.setAttribute("value",c),a.appendChild(d)}function L(c,d,f){var g,h=P(f);if(y.wk&&y.wk<312)return g;if(h){typeof c.id==a&&(c.id=f);if(y.ie&&y.win){var i="";for(var j in c)c[j]!=Object.prototype[j]&&(j.toLowerCase()=="data"?d.movie=c[j]:j.toLowerCase()=="styleclass"?i+=' class="'+c[j]+'"':j.toLowerCase()!="classid"&&(i+=" "+j+'="'+c[j]+'"'));var k="";for(var l in d)d[l]!=Object.prototype[l]&&(k+='<param name="'+l+'" value="'+d[l]+'" />');h.outerHTML='<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"'+i+">"+k+"</object>",n[n.length]=c.id,g=P(c.id)}else{var m=Q(b);m.setAttribute("type",e);for(var o in c)c[o]!=Object.prototype[o]&&(o.toLowerCase()=="styleclass"?m.setAttribute("class",c[o]):o.toLowerCase()!="classid"&&m.setAttribute(o,c[o]));for(var p in d)d[p]!=Object.prototype[p]&&p.toLowerCase()!="movie"&&M(m,p,d[p]);h.parentNode.replaceChild(m,h),g=m}}return g}function K(a){var c=Q("div");if(y.win&&y.ie)c.innerHTML=a.innerHTML;else{var d=a.getElementsByTagName(b)[0];if(d){var e=d.childNodes;if(e){var f=e.length;for(var g=0;g<f;g++)(e[g].nodeType!=1||e[g].nodeName!="PARAM")&&e[g].nodeType!=8&&c.appendChild(e[g].cloneNode(!0))}}}return c}function J(a){if(y.ie&&y.win&&a.readyState!=4){var b=Q("div");a.parentNode.insertBefore(b,a),b.parentNode.replaceChild(K(a),b),a.style.display="none",function(){a.readyState==4?a.parentNode.removeChild(a):setTimeout(arguments.callee,10)}()}else a.parentNode.replaceChild(K(a),a)}function I(b,c,d,e){u=!0,r=e||null,s={success:!1,id:d};var g=P(d);if(g){g.nodeName=="OBJECT"?(p=K(g),q=null):(p=g,q=d),b.id=f;if(typeof b.width==a||!/%$/.test(b.width)&&parseInt(b.width,10)<310)b.width="310";if(typeof b.height==a||!/%$/.test(b.height)&&parseInt(b.height,10)<137)b.height="137";i.title=i.title.slice(0,47)+" - Flash Player Installation";var j=y.ie&&y.win?"ActiveX":"PlugIn",k="MMredirectURL="+h.location.toString().replace(/&/g,"%26")+"&MMplayerType="+j+"&MMdoctitle="+i.title;typeof c.flashvars!=a?c.flashvars+="&"+k:c.flashvars=k;if(y.ie&&y.win&&g.readyState!=4){var l=Q("div");d+="SWFObjectNew",l.setAttribute("id",d),g.parentNode.insertBefore(l,g),g.style.display="none",function(){g.readyState==4?g.parentNode.removeChild(g):setTimeout(arguments.callee,10)}()}L(b,c,d)}}function H(){return!u&&S("6.0.65")&&(y.win||y.mac)&&!(y.wk&&y.wk<312)}function G(c){var d=null,e=P(c);if(e&&e.nodeName=="OBJECT")if(typeof e.SetVariable!=a)d=e;else{var f=e.getElementsByTagName(b)[0];f&&(d=f)}return d}function F(){var b=m.length;if(b>0)for(var c=0;c<b;c++){var d=m[c].id,e=m[c].callbackFn,f={success:!1,id:d};if(y.pv[0]>0){var g=P(d);if(g)if(S(m[c].swfVersion)&&!(y.wk&&y.wk<312))U(d,!0),e&&(f.success=!0,f.ref=G(d),e(f));else if(m[c].expressInstall&&H()){var h={};h.data=m[c].expressInstall,h.width=g.getAttribute("width")||"0",h.height=g.getAttribute("height")||"0",g.getAttribute("class")&&(h.styleclass=g.getAttribute("class")),g.getAttribute("align")&&(h.align=g.getAttribute("align"));var i={},j=g.getElementsByTagName("param"),k=j.length;for(var l=0;l<k;l++)j[l].getAttribute("name").toLowerCase()!="movie"&&(i[j[l].getAttribute("name")]=j[l].getAttribute("value"));I(h,i,d,e)}else J(g),e&&e(f)}else{U(d,!0);if(e){var n=G(d);n&&typeof n.SetVariable!=a&&(f.success=!0,f.ref=n),e(f)}}}}function E(){var c=i.getElementsByTagName("body")[0],d=Q(b);d.setAttribute("type",e);var f=c.appendChild(d);if(f){var g=0;(function(){if(typeof f.GetVariable!=a){var b=f.GetVariable("$version");b&&(b=b.split(" ")[1].split(","),y.pv=[parseInt(b[0],10),parseInt(b[1],10),parseInt(b[2],10)])}else if(g<10){g++,setTimeout(arguments.callee,10);return}c.removeChild(d),f=null,F()})()}else F()}function D(){k?E():F()}function C(b){if(typeof h.addEventListener!=a)h.addEventListener("load",b,!1);else if(typeof i.addEventListener!=a)i.addEventListener("load",b,!1);else if(typeof h.attachEvent!=a)R(h,"onload",b);else if(typeof h.onload=="function"){var c=h.onload;h.onload=function(){c(),b()}}else h.onload=b}function B(a){t?a():l[l.length]=a}function A(){if(!t){try{var a=i.getElementsByTagName("body")[0].appendChild(Q("span"));a.parentNode.removeChild(a)}catch(b){return}t=!0;var c=l.length;for(var d=0;d<c;d++)l[d]()}}var a="undefined",b="object",c="Shockwave Flash",d="ShockwaveFlash.ShockwaveFlash",e="application/x-shockwave-flash",f="SWFObjectExprInst",g="onreadystatechange",h=window,i=document,j=navigator,k=!1,l=[D],m=[],n=[],o=[],p,q,r,s,t=!1,u=!1,v,w,x=!0,y=function(){var f=typeof i.getElementById!=a&&typeof i.getElementsByTagName!=a&&typeof i.createElement!=a,g=j.userAgent.toLowerCase(),l=j.platform.toLowerCase(),m=l?/win/.test(l):/win/.test(g),n=l?/mac/.test(l):/mac/.test(g),o=/webkit/.test(g)?parseFloat(g.replace(/^.*webkit\/(\d+(\.\d+)?).*$/,"$1")):!1,p=!1,q=[0,0,0],r=null;if(typeof j.plugins!=a&&typeof j.plugins[c]==b)r=j.plugins[c].description,r&&(typeof j.mimeTypes==a||!j.mimeTypes[e]||!!j.mimeTypes[e].enabledPlugin)&&(k=!0,p=!1,r=r.replace(/^.*\s+(\S+\s+\S+$)/,"$1"),q[0]=parseInt(r.replace(/^(.*)\..*$/,"$1"),10),q[1]=parseInt(r.replace(/^.*\.(.*)\s.*$/,"$1"),10),q[2]=/[a-zA-Z]/.test(r)?parseInt(r.replace(/^.*[a-zA-Z]+(.*)$/,"$1"),10):0);else if(typeof h.ActiveXObject!=a)try{var s=new ActiveXObject(d);s&&(r=s.GetVariable("$version"),r&&(p=!0,r=r.split(" ")[1].split(","),q=[parseInt(r[0],10),parseInt(r[1],10),parseInt(r[2],10)]))}catch(t){}return{w3:f,pv:q,wk:o,ie:p,win:m,mac:n}}(),z=function(){!y.w3||((typeof i.readyState!=a&&i.readyState=="complete"||typeof i.readyState==a&&(i.getElementsByTagName("body")[0]||i.body))&&A(),t||(typeof i.addEventListener!=a&&i.addEventListener("DOMContentLoaded",A,!1),y.ie&&y.win&&(i.attachEvent(g,function(){i.readyState=="complete"&&(i.detachEvent(g,arguments.callee),A())}),h==top&&function(){if(!t){try{i.documentElement.doScroll("left")}catch(a){setTimeout(arguments.callee,0);return}A()}}()),y.wk&&function(){if(!t){if(!/loaded|complete/.test(i.readyState)){setTimeout(arguments.callee,0);return}A()}}(),C(A)))}(),W=function(){y.ie&&y.win&&window.attachEvent("onunload",function(){var a=o.length;for(var b=0;b<a;b++)o[b][0].detachEvent(o[b][1],o[b][2]);var c=n.length;for(var d=0;d<c;d++)N(n[d]);for(var e in y)y[e]=null;y=null;for(var f in swfobject)swfobject[f]=null;swfobject=null})}();return{registerObject:function(a,b,c,d){if(y.w3&&a&&b){var e={};e.id=a,e.swfVersion=b,e.expressInstall=c,e.callbackFn=d,m[m.length]=e,U(a,!1)}else d&&d({success:!1,id:a})},getObjectById:function(a){if(y.w3)return G(a)},embedSWF:function(c,d,e,f,g,h,i,j,k,l){var m={success:!1,id:d};y.w3&&!(y.wk&&y.wk<312)&&c&&d&&e&&f&&g?(U(d,!1),B(function(){e+="",f+="";var n={};if(k&&typeof k===b)for(var o in k)n[o]=k[o];n.data=c,n.width=e,n.height=f;var p={};if(j&&typeof j===b)for(var q in j)p[q]=j[q];if(i&&typeof i===b)for(var r in i)typeof p.flashvars!=a?p.flashvars+="&"+r+"="+i[r]:p.flashvars=r+"="+i[r];if(S(g)){var s=L(n,p,d);n.id==d&&U(d,!0),m.success=!0,m.ref=s}else{if(h&&H()){n.data=h,I(n,p,d,l);return}U(d,!0)}l&&l(m)})):l&&l(m)},switchOffAutoHideShow:function(){x=!1},ua:y,getFlashPlayerVersion:function(){return{major:y.pv[0],minor:y.pv[1],release:y.pv[2]}},hasFlashPlayerVersion:S,createSWF:function(a,b,c){return y.w3?L(a,b,c):undefined},showExpressInstall:function(a,b,c,d){y.w3&&H()&&I(a,b,c,d)},removeSWF:function(a){y.w3&&N(a)},createCSS:function(a,b,c,d){y.w3&&T(a,b,c,d)},addDomLoadEvent:B,addLoadEvent:C,getQueryParamValue:function(a){var b=i.location.search||i.location.hash;if(b){/\?/.test(b)&&(b=b.split("?")[1]);if(a==null)return V(b);var c=b.split("&");for(var d=0;d<c.length;d++)if(c[d].substring(0,c[d].indexOf("="))==a)return V(c[d].substring(c[d].indexOf("=")+1))}return""},expressInstallCallback:function(){if(u){var a=P(f);a&&p&&(a.parentNode.replaceChild(p,a),q&&(U(q,!0),y.ie&&y.win&&(p.style.display="block")),r&&r(s)),u=!1}}}}();(function(){if(!window.WebSocket){var a=window.console;if(!a||!a.log||!a.error)a={log:function(){},error:function(){}};if(!swfobject.hasFlashPlayerVersion("10.0.0")){a.error("Flash Player >= 10.0.0 is required.");return}location.protocol=="file:"&&a.error("WARNING: web-socket-js doesn't work in file:///... URL unless you set Flash Security Settings properly. Open the page via Web server i.e. http://..."),WebSocket=function(a,b,c,d,e){var f=this;f.__id=WebSocket.__nextId++,WebSocket.__instances[f.__id]=f,f.readyState=WebSocket.CONNECTING,f.bufferedAmount=0,f.__events={},b?typeof b=="string"&&(b=[b]):b=[],setTimeout(function(){WebSocket.__addTask(function(){WebSocket.__flash.create(f.__id,a,b,c||null,d||0,e||null)})},0)},WebSocket.prototype.send=function(a){if(this.readyState==WebSocket.CONNECTING)throw"INVALID_STATE_ERR: Web Socket connection has not been established";var b=WebSocket.__flash.send(this.__id,encodeURIComponent(a));if(b<0)return!0;this.bufferedAmount+=b;return!1},WebSocket.prototype.close=function(){this.readyState!=WebSocket.CLOSED&&this.readyState!=WebSocket.CLOSING&&(this.readyState=WebSocket.CLOSING,WebSocket.__flash.close(this.__id))},WebSocket.prototype.addEventListener=function(a,b,c){a in this.__events||(this.__events[a]=[]),this.__events[a].push(b)},WebSocket.prototype.removeEventListener=function(a,b,c){if(a in this.__events){var d=this.__events[a];for(var e=d.length-1;e>=0;--e)if(d[e]===b){d.splice(e,1);break}}},WebSocket.prototype.dispatchEvent=function(a){var b=this.__events[a.type]||[];for(var c=0;c<b.length;++c)b[c](a);var d=this["on"+a.type];d&&d(a)},WebSocket.prototype.__handleEvent=function(a){"readyState"in a&&(this.readyState=a.readyState),"protocol"in a&&(this.protocol=a.protocol);var b;if(a.type=="open"||a.type=="error")b=this.__createSimpleEvent(a.type);else if(a.type=="close")b=this.__createSimpleEvent("close");else{if(a.type!="message")throw"unknown event type: "+a.type;var c=decodeURIComponent(a.message);b=this.__createMessageEvent("message",c)}this.dispatchEvent(b)},WebSocket.prototype.__createSimpleEvent=function(a){if(document.createEvent&&window.Event){var b=document.createEvent("Event");b.initEvent(a,!1,!1);return b}return{type:a,bubbles:!1,cancelable:!1}},WebSocket.prototype.__createMessageEvent=function(a,b){if(document.createEvent&&window.MessageEvent&&!window.opera){var c=document.createEvent("MessageEvent");c.initMessageEvent("message",!1,!1,b,null,null,window,null);return c}return{type:a,data:b,bubbles:!1,cancelable:!1}},WebSocket.CONNECTING=0,WebSocket.OPEN=1,WebSocket.CLOSING=2,WebSocket.CLOSED=3,WebSocket.__flash=null,WebSocket.__instances={},WebSocket.__tasks=[],WebSocket.__nextId=0,WebSocket.loadFlashPolicyFile=function(a){WebSocket.__addTask(function(){WebSocket.__flash.loadManualPolicyFile(a)})},WebSocket.__initialize=function(){if(!WebSocket.__flash){WebSocket.__swfLocation&&(window.WEB_SOCKET_SWF_LOCATION=WebSocket.__swfLocation);if(!window.WEB_SOCKET_SWF_LOCATION){a.error("[WebSocket] set WEB_SOCKET_SWF_LOCATION to location of WebSocketMain.swf");return}var b=document.createElement("div");b.id="webSocketContainer",b.style.position="absolute",WebSocket.__isFlashLite()?(b.style.left="0px",b.style.top="0px"):(b.style.left="-100px",b.style.top="-100px");var c=document.createElement("div");c.id="webSocketFlash",b.appendChild(c),document.body.appendChild(b),swfobject.embedSWF(WEB_SOCKET_SWF_LOCATION,"webSocketFlash","1","1","10.0.0",null,null,{hasPriority:!0,swliveconnect:!0,allowScriptAccess:"always"},null,function(b){b.success||a.error("[WebSocket] swfobject.embedSWF failed")})}},WebSocket.__onFlashInitialized=function(){setTimeout(function(){WebSocket.__flash=document.getElementById("webSocketFlash"),WebSocket.__flash.setCallerUrl(location.href),WebSocket.__flash.setDebug(!!window.WEB_SOCKET_DEBUG);for(var a=0;a<WebSocket.__tasks.length;++a)WebSocket.__tasks[a]();WebSocket.__tasks=[]},0)},WebSocket.__onFlashEvent=function(){setTimeout(function(){try{var b=WebSocket.__flash.receiveEvents();for(var c=0;c<b.length;++c)WebSocket.__instances[b[c].webSocketId].__handleEvent(b[c])}catch(d){a.error(d)}},0);return!0},WebSocket.__log=function(b){a.log(decodeURIComponent(b))},WebSocket.__error=function(b){a.error(decodeURIComponent(b))},WebSocket.__addTask=function(a){WebSocket.__flash?a():WebSocket.__tasks.push(a)},WebSocket.__isFlashLite=function(){if(!window.navigator||!window.navigator.mimeTypes)return!1;var a=window.navigator.mimeTypes["application/x-shockwave-flash"];if(!a||!a.enabledPlugin||!a.enabledPlugin.filename)return!1;return a.enabledPlugin.filename.match(/flashlite/i)?!0:!1},window.WEB_SOCKET_DISABLE_AUTO_INITIALIZATION||(window.addEventListener?window.addEventListener("load",function(){WebSocket.__initialize()},!1):window.attachEvent("onload",function(){WebSocket.__initialize()}))}})()
