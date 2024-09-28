/**
 * Popup menu page scripts.
 * @since 3.0
 */
"use strict";

/** Tracks the currently selected X-ChromeLogger-Enable header flags, starting with the stored settings. */
var current_flags = 0;

/** This runs once, on page load. */
async function setupUi() {

	try {

		// get currently stored option values
		const opts = await browser.storage.sync.get({
			server_en_flags: DEFAULT_OPTIONS.server_en_flags,
			inject_req_headers: DEFAULT_OPTIONS.inject_req_headers
		});

		current_flags = opts.server_en_flags;

		// loop over all the checkbox choices in the menu to set their initial value/status
		const buttons = document.querySelectorAll(".opt-flag");
		for (const btn of buttons) {
			const flag = SERVER_ENABLE_FLAG[btn.name];
			if (flag == undefined)
				continue;
			//btn.value = flag.toString();
			btn.checked = (current_flags & flag);
			// attach event listener if headers are enabled, or disable the button otherwise
			if (opts.inject_req_headers)
				btn.addEventListener("change", onMenuClick);
			else
				btn.disabled = true;
		}

		// simply map the extention options button to the browser runtime command
		document.querySelector("#open_ext_options").addEventListener("click", () => {
			browser.runtime.openOptionsPage();
			// in FF for some reason the popup stays open after the options page is shown
			window.close();
		});

		// show the warning message if header injection is disabled
		if (!opts.inject_req_headers)
			document.querySelector("#headers_disabled_warning").toggleAttribute('hidden');

	}
	catch (ex) {
		console.error(ex);
	}

}

/**
	Handler for menu selection changes, which are all checkboxes to set the `server_en_flags` extension option.
*/
async function onMenuClick(event) {

	try {
		const flagName = event.target?.name || '',
			flag = SERVER_ENABLE_FLAG[flagName];

		if (flag == undefined) {
			console.warn(`Option flag named '${flagName}' isn't valid.`);
			return;
		}

		current_flags = event.target.checked ? current_flags |= flag : current_flags &= ~flag;
		await browser.storage.sync.set( { server_en_flags: current_flags } );
	}
	catch (e) {
		console.error(e);
	}

}

// go
setupUi();
