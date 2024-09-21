"use strict";
/**
 * Background script.
 * All the routine heavy lifting should be done here and the results coordinated betweent dev.js devtools script and log.js content script.
 */

/** Array of response header(s) to process data from. */
const PROCESS_REQUEST_HEADERS = [ 'x-chromelogger-data', 'x-chromephp-data'  ];
/** Cached runtime option values to avoid repeated lookups. */
const OPTIONS = structuredClone(DEFAULT_OPTIONS);

/**
 * Collection of keyed tab objects connected when devtools are opened on a tab.
 * @since 1.0
 * @var object tabs
 */
var tabs = {};

/**
 * Return tab id integer from port.name.
 * @since 1.0
 * @param runtime.Port port
 * @return integer
 */
function tabIdFromPort( port ) {
	return parseInt( port.name.substr(3) );
}


/**
 * Return tabs object key from id integer.
 * @since 1.0
 * @param integer tabId
 * @return string
 */
function tabKeyFromId( tabId ) {
	return 'tab'.concat(tabId);
}


/**
 * Returns a tab object from id.
 * @since 1.0
 * @param integer
 * @return Tab|undefined
 */
function tabFromId( tabId ) {
	return tabs[ tabKeyFromId( tabId ) ];
}


/**
 * Tab class.
 * @since 1.0
 * @since 2.0
 *	- removed processContentUrl() method, functionality moved to log.js
 */
class Tab {

	/**
	 * @since 1.0
	 * @param integer tabId
	 * @param runtime.Port port
	 */
	constructor( tabId, port ){

		/**
		 * Tab id.
		 * @since 1.0
		 * @var integer
		 */
		this.id = tabId;

		/**
		 * Incoming connection from devtools being loaded / set by runtime.onConnect listener.
		 * @since 1.0
		 * @var runtime.Port
		 */
		this.devPort = port;

		/**
		 * Contains pending data while tab main frame is loading.
		 * @since 1.0
		 * @var array
		 */
		this.pending = [];

		/**
		 * Reflects tab DOMReady state. When true the tab is ready to receive messages.
		 * @since 1.1
		 * @var bool
		 */
		this.ready = false;

		/**
		 * Fallback to devtools for reporting should log.js script injection fail onDOMReady.
		 * @since 1.2
		 * @var bool
		 */
		this.fallback = false;

		/**
		 * Sends header details to devtools which, if open, will send them back to onDevPortMessage()
		 * @since 1.0
		 * @param webRequest.onHeadersReceived details
		 * @note This way we're only processing headers when the user can see output from them logged to the web console.
		 * @note Setting up an anonymous function this way in order to make the handler for this tab distinct from that of others so the event handler can tell difference.
		 */
		this.onHeadersReceived = function( details ) {
			tabs[ tabKeyFromId( details.tabId ) ].devPort.postMessage( details );
		}

		const version = browser.runtime.getManifest().version;  // cache for headers
		/**
			This event handler for `browser.webRequest.onBeforeSendHeaders` event injects X-ChromeLogger headers into the current request for this tab.
			It does _not_ check the `inject_req_headers` setting -- disconnect the event handler to stop injecting headers instead.
			@see toggleInjectRequestHeaders()
		*/
		this.onBeforeSendHeaders = function(details) {
			details.requestHeaders.push(
				{ name: "X-ChromeLogger-Enable", value: "1" },
				{ name: "X-ChromeLogger-Version", value: version }
			);
			// console.log(details.requestHeaders);
			return { requestHeaders: details.requestHeaders };
		}

	}


	/**
	 * Logs data to log.js
	 * @since 1.0
	 * @since 1.2
	 *	- send data back on port if Tab.fallback == true
	 * @param object data
	 *	- ChromeLogger Data
	 */
	log( data ){

		// tab is DOMReady ? send to log.js now !
		if ( this.ready ) browser.tabs.sendMessage( this.id, data );

		// fallback to devtools.inspectedWindow.eval() ? send back through the port now !
		else if ( this.fallback ) this.devPort.postMessage( data );

		// tab document still loading ! queue in pending data to be sent by tabs.onUpdated listener on complete
		else this.pending.push( data );

	}


}


/**
 * Removes a corresponding tab and events / used as tabs.onRemoved handler too.
 * @since 1.0
 * @param integer tabId
 */
function onTabRemoved( tabId ) {

	var tabKey = tabKeyFromId(tabId),
		tab = tabs[ tabKey ];

	if ( tab ) {

		// disconnect ports ...
		tab.devPort.disconnect();

		// remove handlers ...
		browser.webRequest.onHeadersReceived.removeListener( tab.onHeadersReceived );
		toggleInjectRequestHeaders(tabKey, 2 /* force remove listener */);

		// remove tab ...
		delete tabs[ tabKey ];

	}

}


/**
 * Process ChromeLogger data rows into console args.
 * @since 1.5
 * @since 1.7
 * 	- flexible support for different row.column arrangments
 * @param ChromeLoggerData object data
 */
function processChromeLoggerData( data ) {

	return new Promise( resolve => {

		// process data, pass to Tab.log() ...

		// ensure lowercase columns array ...
		data.columns = (
			! data.columns
			|| ! Array.isArray(data.columns)
			? [ 'log', 'backtrace', 'type' ]
			: data.columns.map(column=>{ return column.toLowerCase(); })
		);

		// map to rows array to console method args ...
		data.args = data.rows.map(row=>{

			// convert row to object w/columns mapped to properties ...
			row = row.reduce(function( row, value, index ){
				row[ data.columns[ index ] ] = value;
				return row;
			}, { 'log': [], 'backtrace': false, 'type': 'log' });

			var

				// console method / @see https://developer.mozilla.org/en-US/docs/Web/API/Console
				method = row.type,

				// console.[method] arguments ...
				args = row.log,

				// file:line ...
				fileline = row.backtrace,

				// substitution pattern ...
				tmpl_pattern = '',

				// substition arguments ...
				tmpl_args = [];

			// ensure method is valid ...
			if (
				typeof method != 'string'
				|| ! console[ method ]
			) method = 'log';

			// ensure arguments is array ...
			if ( ! Array.isArray(args) ) args = [ args ];

			// assertion ? ...
			if ( method == 'assert' ) {
				// resolves true ? log nothing ...
				if ( args.shift() ) return false;
				// false ! log error ...
				else method = 'error';
			}

			// process arguments ...
			if (
				args.length > 0
				&& [ 'log', 'info', 'warn', 'error', 'group', 'groupCollapsed' ].includes(method)
			) {

				// detect, passthru an existing substitution pattern ...
				if (
					typeof args[0] == 'string'
					&& /(^|[^%])%(s|d|i|f|o|O|c|\.\d+(d|i|f))/.test(args[0])
				) {
					tmpl_pattern = args.shift();
					tmpl_args = args;
				}

				// generate pattern ...
				else {

					const stringStyle = OPTIONS.console_substitution_styles[
						( method == 'groupCollapsed' ? 'group' : method )
					];

					// make array ...
					tmpl_pattern = [];

					// populate pattern and args arrays ...
					args.forEach(arg=>{

						switch ( typeof arg ) {

							case 'string':
								if (stringStyle) {
									tmpl_pattern.push('%c%s%c');
									// unescape any passed substitution patterns ...
									arg = arg.replace(/%{2,}(s|d|i|f|o|O|c|\.\d+(d|i|f))/g, '%$1');
									tmpl_args.push(stringStyle, arg, '');
								}
								else {
									tmpl_pattern.push(arg);
								}
								break;

							case 'number':
								if (OPTIONS.console_substitution_styles.number) {
									tmpl_pattern.push('%c%s%c');
									tmpl_args.push(OPTIONS.console_substitution_styles.number, arg, '');
								}
								else {
									tmpl_args.push(arg);
								}
								break;

							case 'object':

								// resolves to true (not null or undefined) and has special class name property ? prepend and remove ...
								if ( OPTIONS.console_substitution_styles.classname && arg && arg.hasOwnProperty('___class_name') ) {
									tmpl_pattern.push('%c%s%c');
									tmpl_args.push(OPTIONS.console_substitution_styles.classname, arg.___class_name, '');
									delete arg.___class_name;
								}
								// no break, passthru ...

							default:
								tmpl_pattern.push('%o');
								tmpl_args.push(arg);
								break;

						}

					});

					// stringify pattern ...
					tmpl_pattern = tmpl_pattern.join(' ');

				}

			}

			// straight arguments for all other console methods, no backtrace ...
			else {
				tmpl_args = args;
				fileline = false;
			}

			// append fileline ...
			if ( fileline && OPTIONS.backtrace_position != BACKTRACE_POSITION.NONE ) {

				let fl_pattern = '%c%s%c';
				const fl_args = [ OPTIONS.console_substitution_styles.fileline, fileline, '' ];

				switch ( OPTIONS.backtrace_position )
				{
					case BACKTRACE_POSITION.TRAILING:
						// prepend a space if there is other pattern content ...
						if ( tmpl_pattern )
							fl_pattern = " " + fl_pattern;
						tmpl_pattern = tmpl_pattern.concat(fl_pattern);
						tmpl_args.push(...fl_args);
						break;

					case BACKTRACE_POSITION.LEADING:
						// assume that the style template will handle spacing (margin/padding)
						tmpl_pattern = fl_pattern.concat(tmpl_pattern);
						tmpl_args.unshift(...fl_args);
						break;
				}

			}

			// prepend string pattern to arguments ...
			if ( tmpl_pattern ) tmpl_args.unshift( tmpl_pattern );

			// prepend method ...
			tmpl_args.unshift( method );

			// return processed arguments ...
			return tmpl_args;

		}).filter( args => args !== false );

		// return processed data ...
		resolve(data);

	});

}


/** Decodes and parses a b64-encoded log message,
	hands it off to processChromeLoggerData() for processing/formatting,
	then logs the result to the given tab.
*/
function decodeAndProcessLoggerData( tabId, logData ) {
	try {
		// base64 decode (utf-8 safe) / parse json ...
		const data = JSON.parse(
			new TextDecoder().decode(
				Uint8Array.from( atob(logData), (m) => m.codePointAt(0) )
			)
		);

		// process and log ...
		processChromeLoggerData( data ).then(data=>{
			tabFromId( tabId ).log( data );
		});

	} catch( error ) {
		console.error(error);
	}
}


/** Log the given method and URL to tab's dev console using the specified css style and log type ("log"/"group"/"groupCollapsed"/etc). */
function logDataUrl( tabId, method, url, style, type ) {
	processChromeLoggerData({
		rows: [[
			[ '%c%s %s', style, method, url ], "", type
		]]
	}).then(data => tabFromId( tabId ).log( data ) );
}

/** Log a groupEnd message to the console to close out a data URL group. */
function endDataUrlGroup(tabId) {
	processChromeLoggerData({
		rows: [["", "", "groupEnd"]]
	}).then(data => tabFromId( tabId ).log( data ) );
}


/**
 * Tab.devPort runtime.Port.onMessage event handler.
 * Catches and processes header details sent by Tab.onHeadersReceived() handler to and passed back from a verified open devtools.
 *
 * @since 1.0
 * @since 1.5
 *	- accept rows array retrieved from document by devtools ...
 * @since 1.7
 *	- also checks for X-ChromePHP-Data header
 *	- logs details url, method separately as chromelogger data
 * @since 2.0
 *	- removed capturing details.rows from dev.js
 *
 * @param tabs.onHeadersReceived details
 */
function onDevPortMessage( details ) {

	if (!details.responseHeaders)
		return;

	// details object passed through the open devtools ...

	const headers = details.responseHeaders
		// Just get the headers we're interested in...
		.filter((h) => PROCESS_REQUEST_HEADERS.find( value => h.name.toLowerCase().startsWith(value)))
		// ... and sort them by name in case of multiples with different suffixes (eg. X-ChromeLogger-Data-0001, -0002, etc)
		.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

	// Bail out early if no headers to handle.
	if (!headers.length)
		return;

	// process header data ...

	// display data url ? log it as chromelogger data ...
	if ( OPTIONS.display_data_url )
		logDataUrl(details.tabId, details.method, details.url, OPTIONS.console_substitution_styles.header, OPTIONS.display_data_url);

	// In Chrome each header comes individually, even if they have the same names (in Firefox all values are joined together, see note below).
	// For us, all headers with the same name are part of one B64-encoded message (log entry), so
	// to join long log messages together we need to collect all values for the headers with same name.
	// Use a Map because that preserves key insertion order.
	const buffer = new Map();

	// collect headers ...
	headers.forEach(( header ) => {
		let headerValue = buffer.get(header.name) || "";
		// In Firefox (maybe others?) the `header.value` for all headers with the same name are joined
		// together with commas into one string. Split them and re-join w/out the comma...
		headerValue += header.value.split(',').join('');
		buffer.set(header.name, headerValue);
	});

	// Now process the collected headers
	buffer.forEach( (value) => decodeAndProcessLoggerData(details.tabId, value)	);

	// display data url as group ? log the `groupEnd()` part ...
	if ( OPTIONS.display_data_url.startsWith('group') )
		endDataUrlGroup(details.tabId);

}


/**
 * Tab.devPort runtime.Port.onDisconnect event handler.
 * @since 1.0
 * @param runtime.Port port
 */
function onDevPortDisconnect( port ) {

	// report error ...
	if ( port.error ) console.error('Disconnected due to error:', port.error.message);
	else console.error( port.name, 'has been disconnected!' );

	// remove tab if any exists ...
	onTabRemoved( tabIdFromPort(port) );

}


/**
	Adds/removes browser.webRequest.onBeforeSendHeaders event listener based on current user settings.
	Used for optionally injecting X-ChromeLogger headers into a HTTP request.
	@param { array | string } tabKeys The tab(s) to apply the changes to.
	@param { enum | undefined } forceAction One of:
		0 = Sub/unsub depending on user settings (default);
		1 = Force re-subscribing event listeners with (presumably) new filter `types` setting;
		2 = Force unsubscribe;
*/
function toggleInjectRequestHeaders(tabKeys, forceAction = 0) {

	if (!Array.isArray(tabKeys))
		tabKeys = [ tabKeys ];

	// loop over each tab whose listener we'll be updating
	for (const tId of tabKeys) {
		const tab = tabs[tId];
		if (!tab || !tab.id)
			continue;

		// currently connected?
		let isSubbed = browser.webRequest.onBeforeSendHeaders.hasListener( tab.onBeforeSendHeaders );

		// need to disconnect listener if inject headers setting is false, if we're modifying the request type filter, or forcing unsub
		if ( isSubbed && (forceAction || !OPTIONS.inject_req_headers) ) {
			browser.webRequest.onBeforeSendHeaders.removeListener( tab.onBeforeSendHeaders );
			isSubbed = false;
		}

		// (re)connect event handler if not already connected, setting is enabled, unsub is not forced, and list of request filters is valid
		if (
			!isSubbed && OPTIONS.inject_req_headers && forceAction != 2 &&
			Array.isArray(OPTIONS.inject_req_headers_for_types) &&
			OPTIONS.inject_req_headers_for_types.length
		) {
			browser.webRequest.onBeforeSendHeaders.addListener(
				tab.onBeforeSendHeaders,
				{
					tabId: tab.id,
					urls: [ "<all_urls>" ],
					types: OPTIONS.inject_req_headers_for_types,
				},
				[ "blocking", "requestHeaders" ],
			);
		}
	}

}


/**
	Settings value change handler.
	Used to update runtime options cache and set up header injection features when settings are changed w/out re-starting the extension.
*/
function onStorageChanged(changes, area) {

	if (area != "sync")
		return;

	// Update cached options with all changes.
	Object.assign(
		OPTIONS,
		Object.fromEntries(
			Object.entries(changes).map(([key,val]) => [ key, structuredClone(val.newValue) ])
		)
	);

	// Check if we need to (re)connect/disconnect header injection events;
	// Check that value actually did change since often they're in the changes list even if unchanged;
	// If only the type of requests being handled is changing, we need to signal that to the toggleInjectRequestHeaders() handler.
	let typeChange = false;
	if (
		(
			Object.hasOwn(changes, 'inject_req_headers') &&
			changes.inject_req_headers.oldValue != changes.inject_req_headers.newValue
		) ||
		( typeChange = (
				Object.hasOwn(changes, 'inject_req_headers_for_types') &&
				JSON.stringify(changes.inject_req_headers_for_types.oldValue) != JSON.stringify(changes.inject_req_headers_for_types.newValue)
			)
		)
	) {
		// toggleInjectRequestHeaders() will toggle event listeners on all active tabs and update the request types as well if needed,
		// no need to call it twice even if both settings changed.
		toggleInjectRequestHeaders(Object.keys(tabs), typeChange ? 1 : 0);
	}

}


/** Initial load of saved option values into local cache. */
browser.storage.sync.get(DEFAULT_OPTIONS).then((opts) => {

	// convert from legacy setting
	if (typeof opts.display_data_url == 'boolean') {
		opts.display_data_url = opts.display_data_url ? "log" : "";
		browser.storage.sync.set({'display_data_url': opts.display_data_url})
	}

	Object.assign(OPTIONS, structuredClone(opts));
});


/**
	Listener / Assigns onStorageChanged handler for extension settings change events.
*/
browser.storage.onChanged.addListener(onStorageChanged);


/**
 * Listener / Assigns tab object and handlers connecting devtools context when devtools are opened on a tab.
 *
 * @since 1.0
 * @since 1.7
 *	- removed onHeadersReceived listener "types" to process headers from ALL resources.
 *
 * @param runtime.Port port
 */
browser.runtime.onConnect.addListener(( port ) => {

	var tabId = tabIdFromPort(port),
		tabKey = port.name,
		tab = tabs[ tabKey ];

	// ports change when devtools are closed/opened so [re]assign port event handlers ...
	port.onDisconnect.addListener(onDevPortDisconnect);
	port.onMessage.addListener(onDevPortMessage);

	// no tab ? create it ...
	if ( ! tab ) tab = tabs[ tabKey ] = new Tab( tabId, port );
	// update existing port ...
	else tab.devPort = port;

	// no tab specific anon (IMPORTANT!) listener assigned to catch headers ? assign now ...
	if ( ! browser.webRequest.onHeadersReceived.hasListener( tab.onHeadersReceived ) ) {
		browser.webRequest.onHeadersReceived.addListener(
			tab.onHeadersReceived,
			{
				"urls": [ "<all_urls>" ],
				"tabId": tabId
			},
			[ "responseHeaders" ]
		);
	}

	// Make sure header injection is set up according to configuration.
	// The function will check for existing listener mapping first.
	toggleInjectRequestHeaders(tabKey);

});


/**
 * Listener / receives ChromeLoggerData objects from log.js parsed from document.
 *
 * @since 2.0
 *
 * @param ChromeLoggerData details
 */
browser.runtime.onMessage.addListener(( details )=>{

	processChromeLoggerData( details ).then(data=>{
		tabFromId( details.tabId ).log( data );
	});

});


/**
 * Listener / Assigns onTabRemoved handler for tab removal events.
 * @note Tried to track closing browser.windows events but it doesn't work as of 2017Oct08
 * @todo Whenever a devtools close event becomes available, bind to that instead of this!
 * @since 1.0
 * @param integer tabId
 */
browser.tabs.onRemoved.addListener(onTabRemoved);


/**
 * Reset tab ready state.
 * @since 1.1
 */
browser.webNavigation.onBeforeNavigate.addListener(( details )=>{
	var tab = tabFromId( details.tabId );
	if ( tab && details.frameId == 0 ) {
		tab.ready = false;
		tab.fallback = false;
	}
});


/**
 * Inject log.js and update tab ready state.
 * @since 1.1
 * @since 1.2
 *	- added fallback to devtools reporting if script injection fails
 * @since 1.5
 *	- finally tell tab to process loaded DOM content for additional info to log
 * @since 2.0
 *	- moved DOM content processing from dev.js to log.js
 */
browser.webNavigation.onDOMContentLoaded.addListener(( details )=>{

	var tab = tabFromId( details.tabId );
	if (
		tab
		&& details.frameId == 0 // main tab document ...
	) {

		// inject shim for Chrome compatibility (ignore errors for now)
		browser.tabs.executeScript( details.tabId, { file: '/browser-polyfill.min.js' });
		// inject log.js to receive messages sent to tab ? ...
		browser.tabs.executeScript( details.tabId, { file: '/log.js' })
		.then(()=>{

			// load global functions required by log.js / assume this works at this point ...
			browser.tabs.executeScript( details.tabId, { file: '/global.js' })
			.finally(()=>{

				// update ready state ...
				tab.ready = true;

				// send any pending items ...
				while ( tab.pending.length ) browser.tabs.sendMessage( details.tabId, tab.pending.shift() );

				// tell tab to parse any items from the document itself ...
				browser.tabs.sendMessage( details.tabId, { tabId: details.tabId });

			});

		// unable to inject script ! fallback to devtools functions ...
		}).catch(()=>{

			// fallback to devTools.inspectedWindow.eval() !!!
			tab.fallback = true;

			// send any pending items back through the dev port ...
			while ( tab.pending.length ) tab.devPort.postMessage( tab.pending.shift() );

		});

	}

});
