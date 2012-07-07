/**
 * @author Pablo Tejada
 * Built on 2012-07-07 @ 02:43
 */

//Generate a random string
function randomString(l){
	var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
	var string_length = l;
	var randomstring = '';
	for (var i=0; i<string_length; i++) {
		var rnum = Math.floor(Math.random() * chars.length);
		randomstring += chars.substring(rnum,rnum+1);
	}
	return randomstring;
}

// Official bind polyfill at developer.mozilla.org
if(!Function.prototype.bind){
	Function.prototype.bind = function(oThis){
	if(typeof this !== "function"){
		// closest thing possible to the ECMAScript 5 internal IsCallable function
		throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
	}

	var aArgs = Array.prototype.slice.call(arguments, 1), 
		fToBind = this, 
		fNOP = function(){},
		fBound = function(){
			return fToBind.apply(this instanceof fNOP
								 ? this
								 : oThis || window,
								 aArgs.concat(Array.prototype.slice.call(arguments)));
		};

	fNOP.prototype = this.prototype;
	fBound.prototype = new fNOP();

	return fBound;
	};
}

function APE( server, events, options ){
	this.options = {
		'poll': 25000,
		debug: true,
		session: true,
		connectionArgs: {},
		server: server
	}
	this.identifier = "APS";
	this.version = 'draft-v2';
	this.state = 0;
	this.events = {_queue: {}};
	this.chl = 0;
	this.user = {};
	this.pipes = {};
	this.channels = {};
	
	//Add Events
	this.on(events);

	var cb = {
		'onmessage': this.onMessage.bind(this),
		'onerror': function(err){
			console.log("ERROR >> ",err);
		}
	}

	this.connect = function(args){
		var client = this;
		this.options.connectionArgs = args || this.options.connectionArgs;
		
		server = server || APE.server;
		if(this.state == 0)
			this.transport = new APE.transport(server, cb, options);
		
		//alert("connnecting...")
		
		//Handle sessions
		if(this.options.session == true){
			if(this.session.restore() == true) return this;
		}
		
		this.send('CONNECT', args);
		
		return this;
	}
	
	this.session.client = this;
	return this;
}

APE.prototype.trigger = function(ev, args){
	ev = ev.toLowerCase();
	if(!(args instanceof Array)) args = [args];
	
	//GLobal
	if("ape" in this){
		for(var i in this.ape.events[ev]){
			if(this.ape.events[ev].hasOwnProperty(i)){ 
				this.ape.events[ev][i].apply(this, args);
				this.log("{{{ " + ev + " }}} on client ", this.ape);
			}
		}
	}
	
	//Local
	for(var i in this.events[ev]){
		if(this.events[ev].hasOwnProperty(i)){
			this.events[ev][i].apply(this, args);
			if(!this.ape){
				this.log("{{{ " + ev + " }}} on client ", this);
			}else{
				this.log("{{{ " + ev + " }}} on channel " + this.name, this);
			}
		}
	}
}

APE.prototype.on = function(ev, fn){
	var Events = [];
	
	if(typeof ev == 'string' && typeof fn == 'function'){
		Events[ev] = fn;
	}else if(typeof ev == "object"){
		Events = ev;
	}else{
		return this;
	}
	
	for(var e in Events){
		var fn = Events[e];
		if(!this.events[e])
			this.events[e] = [];
		this.events[e].push(fn);
	}
	
	return this;
}

APE.prototype.poll = function(){
	this.poller = setTimeout((function(){ this.check() }).bind(this), this.options.poll);
}

APE.prototype.getPipe = function(user){
	if(typeof user == 'string'){
		return this.pipes[user];
	} else {
		return this.pipes[user.getPubid()];
	}
}

APE.prototype.send = function(cmd, args, pipe, callback){
	var specialCmd = {CONNECT: 0, RESTORE:0, SESSION:0};
	if(this.state == 1 || cmd in specialCmd){

		var tmp = {
			'cmd': cmd,
			'chl': this.chl
		}

		if(args) tmp.params = args;
		if(pipe) tmp.params.pipe = typeof pipe == 'string' ? pipe : pipe.pubid; 
		if(this.session.id) tmp.sessid = this.session.id;

		this.log('<<<< ', cmd.toUpperCase() , " >>>> ", tmp);
		
		if(typeof callback != "function")	callback = function(){};
		
		this.log(tmp);
		var data = [];
		try { 
			data = JSON.stringify([tmp]);
		}catch(e){
			this.log(e);
			this.log(data);
		}
		
		//alert(data);
		
		this.transport.send(data);
		if(!(cmd in specialCmd)){
			clearTimeout(this.poller);
			this.poll();
		}
		this.chl++;
		this.session.saveChl();
	} else {
		this.on('ready', this.send.bind(this, cmd, args));
	}
	
	return this;
}

APE.prototype.check = function(){
	this.send('CHECK');
}

APE.prototype.sub = function(channel, Events, callback){
	//Handle the events
	if(typeof Events == "object"){
		if(typeof channel == "object"){
			for(var chan in channel){
				this.onChannel(channel[chan], Events);
			}
		}else{
			this.onChannel(channel, Events);
		}
	}
	
	//Handle callback
	if(typeof callback == "function"){
		if(typeof channel == "object"){
			for(var chan in channel){
				this.onChannel(channel[chan], "joined", callback);
			}
		}else{
			this.onChannel(channel, "joined", callback);
		}
	}
	
	//Join Channel
	if(this.state == 0){
		this.on("ready", this.sub.bind(this, channel));
		this.connect({user: this.user});
		
	}else if(typeof this.channels[channel] != "object"){
		this.send('JOIN', {'channels': channel});
	}
	
	return this;
}

APE.prototype.pub = function(channel, data){
	var pipe = this.getChannel(channel);
	
	if(pipe){
		var args = {data: data};
		pipe.send("Pub", args);
		pipe.trigger("pub",args);
	}else{
		this.log("NO Channel " + channel);
	}
};

APE.prototype.getChannel = function(channel){
	if(channel in this.channels){
		return this.channels[channel];
	}
	
	return false;
}

APE.prototype.onChannel = function(channel, Events, fn){
	if(channel in this.channels){
		this.channels[channel].on(Events, fn);
		return true;
	}
	
	if(typeof Events == "object"){
		//add events to queue
		if(typeof this.events._queue[channel] != "object")
			this.events._queue[channel] = [];
		
		//this.events._queue[channel].push(Events);
		for(var $event in Events){
			var fn = Events[$event];
			
			this.events._queue[channel].push([$event, fn]);
			
			this.log("Adding ["+channel+"] event '"+$event+"' to queue");
		}
	}else{
		var xnew = Object();
		xnew[Events] = fn;
		this.onChannel(channel,xnew);
	}
}

APE.prototype.unSub = function(channel){
	if(channel == "") return;
	this.getChannel(channel).leave();
}

//Debug Function for Browsers console
APE.prototype.log = function($obj){
	if(!this.debug) return;
	
	var args =  Array.prototype.slice.call(arguments);
	args.unshift("[APE]");
	
	window.console.log.apply(console, args);
};


APE.prototype.onMessage = function(data){
	//var data = data;
	try { 
		data = JSON.parse(data)
	}catch(e){
		//this.check();
	}
	
	var cmd, args, pipe;
	for(var i in data){
		cmd = data[i].raw;
		args = data[i].data;
		pipe = null;
		clearTimeout(this.poller);
		
		this.log('>>>> ', cmd , " <<<< ", args);

		switch(cmd){
			case 'LOGIN':
				this.state = this.state == 0 ? 1 : this.state;
				this.user.sessid = this.session.id = args.sessid;
				this.poll();
				this.session.save();
			break;
			case 'IDENT':
				this.user = new APE.user(args.user, this);
				this.user.sessid = this.session.id;
				this.pipes[this.user.pubid] = this.user;
				
				//alert(this.state);
				if(this.state == 1)
					this.trigger('ready');
				
				//this.poll(); //This call is under observation
			break;
			case 'RESTORED':
				//Session restored completed
				this.state = 1;
				this.trigger('ready');
			break;
			case 'CHANNEL':
				//this.log(pipe, args);
				pipe = new APE.channel(args.pipe, this);
				this.pipes[pipe.pubid] = pipe;
				this.channels[pipe.name] = pipe;
				
				var u = args.users;
				var user;
				
				//import users from channel to client
				for(var i = 0; i < u.length; i++){
					user = this.pipes[u[i].pubid]
					if(!user){
						user = new APE.user(u[i], this);
						this.pipes[user.pubid] = user;
					}
					
					user.channels[pipe.name] = pipe;
					pipe.users[user.pubid] = user;
					
					//Add user's own pipe to channels list
					user.channels[user.pubid] = user;

					//No Need to trigger this event
					//this.trigger('join', [user, pipe]);
				}
				
				//Add events from queue
				if(pipe.name in this.events._queue){
					var queue = this.events._queue[pipe.name];
					var ev, fn;
					for(var i in queue){
						ev = queue[i][0];
						fn = queue[i][1];
						
						pipe.on(ev,fn);
					}
				}
				
				pipe.trigger('joined',this.user, pipe);
				this.trigger('newChannel', pipe);
				
			break;
			case "PUBDATA":
				var user = this.pipes[args.from.pubid];
				pipe = this.pipes[args.pipe.pubid];
				
				pipe.trigger(args.type, [args.content, user, pipe]);
			break;
			case 'JOIN':
				var user = this.pipes[args.user.pubid];
				pipe = this.pipes[args.pipe.pubid];

				if(!user){
					user = new APE.user(args.user, this);
					this.pipes[user.pubid] = user;
				}
				
				//Add user's own pipe to channels list
				user.channels[pipe.pubid] = user;
				
				//Add user to channel list
				pipe.addUser(user);
				
				pipe.trigger('join', [user, pipe]);
			break;
			case 'LEFT':
				pipe = this.pipes[args.pipe.pubid];
				var user = this.pipes[args.user.pubid];
				
				delete user.channels[pipe.pubid];
				
				for(var i in user.channels){
					if(user.channels.hasOwnProperty(i)) delete this.pipes[user.pubid];
					break;
				}
				
				pipe.trigger('left', [user, pipe]);
			break;
			case 'NOSESSION':
				this.session.connect();
				
			break;
			case 'ERR' :
				switch(args.code){
					case "001":
					case "002":
					case "003":
						clearTimeout(this.poller);
						this.trigger("dead", args);
						break;
					case "004":
					case "250":
						this.state = 0;
						this.session.connect();
						break;
					default:
						this.check();
				}
				this.trigger("error",args);
				this.trigger("error"+args.code,args);
			break;
			default:
				//trigger custom commands
				this.trigger(cmd, [args, raw])
				this.check();
		}
		if(this.transport.id == 0 && cmd != 'ERR' && cmd != "LOGIN" && cmd != "IDENT" && this.transport.state == 1){
			this.check();
		}
		
	}
}


//var APETransport = function(server, callback, options){
APE.transport = function(server, callback, options){
	this.state = 0;//0 = Not initialized, 1 = Initialized and ready to exchange data, 2 = Request is running
	this.stack = [];
	this.callback = callback;

	if('WebSocket' in window && APE.wb == true){
		this.id = 6;
		var ws = new WebSocket('ws://' + server + '/6/');
		APE.transport.prototype.send = function(str){
			if(this.state > 0) ws.send(str);
			else this.stack.push(str);
		}.bind(this);

		ws.onopen = APE.transport.prototype.onLoad.bind(this);

		ws.onmessage = function(ev){
			callback.onmessage(ev.data);
		}
	}else{
		this.id = 0;
		var frame = document.createElement('iframe');
		this.frame = frame;

		with(frame.style){ 
			position = 'absolute';
			left = top = '-10px';
			width = height = '1px';
		}

		frame.setAttribute('src', 'http://' + server + '/?[{"cmd":"frame","params": {"origin":"'+window.location.protocol+'//'+window.location.host+'"}}]');
		
		document.body.appendChild(frame);

		if('addEventListener' in window){
			window.addEventListener('message', this.frameMessage.bind(this), 0);
			frame.addEventListener('load', this.onLoad.bind(this), 0); 
		} else {
			window.attachEvent('onmessage', this.frameMessage.bind(this));
		}


		APE.transport.prototype.send = APE.transport.prototype.postMessage;
	}
}
APE.transport.prototype.postMessage = function(str, callback){
	if(this.state > 0){
		this.frame.contentWindow.postMessage(str, '*');
		this.state = 2;
	} else this.stack.push(str);
	
	this.callback.once = callback || function(){};
}
APE.transport.prototype.frameMessage = function(ev){
	this.state = 1;
	this.callback.onmessage(ev.data);
	this.callback.once(ev.data);
	this.callback.once = function(){};
}
APE.transport.prototype.onLoad = function(){
	if(this.id == 6) this.state = 2;
	else this.state = 1;

	for(var i = 0; i < this.stack.length; i++) this.send(this.stack[i]);
	this.stack = [];
}

//var APEUser = function(pipe, ape) {
APE.user = function(pipe, ape){
	for(var i in pipe.properties){
		this[i] = pipe.properties[i]
	}
	
	this.pubid = pipe.pubid;
	this.ape = ape;
	this.channels = {};
}

APE.user.prototype.send = function(cmd, args) {
	this.ape.send(cmd, args, this);
}


//var APEChannel = function(pipe, ape) {
APE.channel = function(pipe, ape) {
	this.events = {};
	this.properties = pipe.properties;
	this.name = pipe.properties.name;
	this.pubid = pipe.pubid;
	this.ape = ape;
	this.users = {};
	
	this.addUser = function(u){
		this.users[u.pubid] = u;
	}
	
	this.send = function(cmd, args){
		this.ape.send(cmd, args, this);
	}
	
	this.leave = function(){
		this.trigger("unsub", [this.ape.user, this]);
		
		this.ape.send('LEFT', {"channel": this.name});
		
		APE.debug("Unsubscribed from ("+this.name+")");
		
		delete this.ape.channels[this.name];
	}
	
	this.on = APE.prototype.on.bind(this);
	this.pup = APE.prototype.pub.bind(ape, this.name);
	this.trigger = APE.prototype.trigger.bind(this);
	this.log = APE.prototype.log.bind(this, "[CHANNEL]", "["+this.name+"]");
}


APE.prototype.session = {
	id: "",
	chl: {},
	client: {},
	cookie: {},
	data: {},
	
	save: function(){
		if(!this.client.options.session) return;
		
		var pubid = this.client.user.pubid;
		var client = this.client;
		
		var session = {
			channels: Object.keys(client.channels),
			id: this.id,
			pubid: pubid
		}
		
		this.cookie.change(this.id);
		this.saveChl()
		
		//client.send("saveSESSION", session);
	},
	
	saveChl: function(){
		if(!this.client.options.session) return;

		this.chl.change(this.client.chl);
	},
	
	destroy: function(){
		this.cookie.destroy();
		this.chl.destroy();
		this.client.chl = 0;
		this.id = null;
		this.properties = {};
	},
	
	get: function(index){
		return this.data[index];
	},
	
	set: function(index, val){
		this.data[index] = val;
	},
	
	restore: function(){
		var client = this.client;
		
		//alert("restoring")
		this.chl = new APE.cookie(client.identifier + "_chl");
		this.cookie = new APE.cookie(client.identifier + "_session");
		
		
		client.chl = this.chl.value || 0;
		
		if(typeof this.cookie.value == "string"){
			this.id = this.cookie.value;
		}else{
			this.destroy();
			//alert("no session")
			return false;
		}
		
		client.chl++;
		//Restoring session state == 2
		client.state = 2;
		client.send('RESTORE', {sid: this.id})
		return true;
	},
	
	connect: function(){
		var client = this.client;
		var args = client.options.connectionArgs
		
		this.destroy();
		client.send('CONNECT', args);
	}
	
}

APE.cookie = function(name,value,days){
	this.change = function(value,days){
		var name = this.name;
		if(days){
			var date = new Date();
			date.setTime(date.getTime()+(days*24*60*60*1000));
			var expires = "; expires="+date.toGMTString();
		}else{
			var expires = "";
		}
		document.cookie = name+"="+value+expires+"; path="+this.path;
	}
	
	this.read = function(name){
		var nameEQ = name + "=";
		var ca = document.cookie.split(';');
		for(var i=0;i < ca.length;i++) {
			var c = ca[i];
			while (c.charAt(0)==' ') c = c.substring(1,c.length);
			if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
		}
		return null;
	}
	
	this.destroy = function(){
		this.change("", -1);
	}
	
	this.path = "/";
	var exists = this.read(name);
	
	this.name = name;
	
	if(exists && typeof value == "undefined"){
		this.value = exists;
	}else{
		this.value = value;
		this.change(this.value, days);
	}
	return this;
}

