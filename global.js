"use strict";
/**
 * Global scripts.
 */

/** Enum for backtrace position option. */
const OUTPUT_POSITION = {
	NONE: 0,
	LEADING: 1,
	TRAILING: 2
}


/**
	Enum flags for X-ChromeLogger-Enable values to send to the server based on user preferences.
	Low byte is meant for individual log messages, high byte for more general flags, like getting
	details about the processed request in general (call stack, variables, state, etc).
	(These are not for filtering on our, client, side... the console UI already has filters for that.)
*/
const SERVER_ENABLE_FLAG = {
	NONE       : 0,
	TRACE      : 0x0001,  // log()
	DEBUG      : 0x0002,
	INFO       : 0x0004,
	WARN       : 0x0008,
	ERROR      : 0x0010,

	ALL_LEVELS : 0x001F,  // (TRACE | DEBUG | INFO | WARN | ERROR)

	EXTENDED   : 0x0100,  // request "extended" details from server (eg. a state dump), regardless of individual log messages
};


/**
 * Default options object.
 * @since 1.5
 * @since 1.7
 *	- added classname substitution style.
 *	- added display_data_url option.
 * @var object
 */
const DEFAULT_OPTIONS = {
	console_substitution_styles: {
		error: 'color:red;',
		warn: 'color:orange;',
		info: 'color:limegreen;',
		log: '',
		debug: '',
		group: 'color:mediumturquoise;border-bottom:1px dashed;cursor:pointer;',
		number: 'background-color:dodgerblue;color:white;font-weight:bold;border-radius:0.5em;padding:0em 0.3em;',
		fileline: 'color:mediumpurple;font-style:italic;border-style:solid;border-width:0px 1px;border-radius:0.5em;padding:0em 0.5em;',
		classname: 'font-weight:bold;',
		header: 'display:block;background-color:black;color:white;text-align:center;padding:0.2em;border-radius:0.3em;',
		timestamp: 'margin-right:.4em; padding:.01em .5em; border-radius: .3em; background-color:#595959; color:#aadbd9;',
	},
	display_data_url: 'log',
	// add "X-ConsoleLogger-Enabled" and "-Version" request headers?
	inject_req_headers: false,
	// add  those headers for these types of requests  (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/ResourceType)
	inject_req_headers_for_types: [ "main_frame", "sub_frame", "websocket", "xmlhttprequest" ],
	// location of backtrace (file + line) in relation to rest of message output
	backtrace_position: OUTPUT_POSITION.TRAILING,
	// location of time stamp in relation to rest of message output
	timestamp_position: OUTPUT_POSITION.LEADING,
	// X-ChromeLogger-Enable value to use, based on user preference
	server_en_flags: SERVER_ENABLE_FLAG.ALL_LEVELS,
	// X-ChromeLogger-Auth header
	use_request_password: false,
	request_password: "",
};


/**
 * Array.map callback
 * Removes "__proto__" and "length" properties from objects and arrays.
 * @since 1.3
 * @param mixed obj
 * @return mixed
  */
function cleanObjectProperties( obj ) {

	// not an object ? return as-is ...
	if ( typeof obj !== 'object' || obj === null ) return obj;

	// removes length property from arrays ...
	// if ( Array.isArray(obj) ) obj = Object.assign({}, obj);

	// remove annoying __proto__ property ...
	obj.__proto__ = null;

	// recurse through properties ...
	Object.entries(obj).forEach(([ key, value ])=>{ obj[ key ] = cleanObjectProperties( value ); });

	// return cloned object ...
	return obj;

}
