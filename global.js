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
