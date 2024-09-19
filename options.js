"use strict";
/**
 * Options page scripts.
 * @since 1.5
 */

// message box singleton tracking
var messageTimerId = null;

/** Shows a temporary message in the settings form, eg. that the settings were saved. */
function showMessage(message, status = "ok") {
	var msg_el = document.getElementById("message_area");
	msg_el.innerHTML = message;
	msg_el.classList.add('visible');
	msg_el.setAttribute('data-status', status);

	if (messageTimerId !== null)
		clearTimeout(messageTimerId);
	messageTimerId = setTimeout(function() {
		messageTimerId = null;
		msg_el.classList.remove('visible');
	}, 5000);
}


/**
 * Populate form from options.
 * @param object opts
 */
function populateForm( opts ) {

	// populate substitution styles ...
	Object.entries(opts.console_substitution_styles).forEach(([key, value])=>{
		let input = document.querySelector( 'input#console_substitution_styles-'.concat(key) );
		if ( input ) {
			input.value = value;
			input.dispatchEvent(new Event('keyup')); // trigger change event to update label
		}
	});

	// misc. settings ...
	document.querySelector('input#display_data_url').checked = opts.display_data_url;
	document.querySelector("#display_url_logtype").value = opts.display_url_logtype;
	document.querySelector("#display_url_options").disabled = !opts.display_data_url;
	document.querySelector('input#inject_req_headers').checked = opts.inject_req_headers;
	document.querySelector('input#inject_req_headers_for_types').value = opts.inject_req_headers_for_types.join(', ');
	document.querySelector("#inject_req_headers_options").disabled = !opts.inject_req_headers;

}


document.addEventListener("DOMContentLoaded", event=>{

	// style inputs ...
	const console_substitution_style_inputs = document.querySelectorAll("form fieldset#console_substitution_styles input"),
		// checkbox options
		display_data_url_checkbox = document.querySelector("form input#display_data_url"),
		inject_req_headers_checkbox = document.querySelector('form input#inject_req_headers');

	// update label style on input update ...
	console_substitution_style_inputs.forEach(input=>{
		input.addEventListener("keyup", event=>{
			event.target.previousElementSibling.style = event.target.value;
		});
	});

	// populate form from options ...
	browser.storage.sync.get(DEFAULT_OPTIONS)
	.then(populateForm)
	.catch(error=>{ console.error(error); });

	// set change handler on "display url" option to en/disable the "show as group" option accordingly
	display_data_url_checkbox.addEventListener("change", () => {
		document.querySelector("#display_url_options").disabled = !display_data_url_checkbox.checked;
	});

	// set change handler on "inject headers" option to en/disable the "request types" option accordingly
	inject_req_headers_checkbox.addEventListener("change", () => {
		document.querySelector("#inject_req_headers_options").disabled = !inject_req_headers_checkbox.checked;
	});

	// onsubmit ...
	document.querySelector("form").addEventListener("submit", event=>{

		event.preventDefault();

		// reset ...
		if ( event.explicitOriginalTarget.id == 'reset' ) {

			// set from default options ? update form from default options ...
			browser.storage.sync.set(DEFAULT_OPTIONS)
			.then(()=>{
				populateForm(DEFAULT_OPTIONS);
				showMessage("Options reset to defaults.");
			})
			.catch(error=>{
				console.error(error);
				showMessage("Error: " + error.message, "error");
			});

		}

		// save ...
		else {

			// styles collection ...
			let console_substitution_styles = {};

			// update collection ...
			console_substitution_style_inputs.forEach(input=>{
				console_substitution_styles[ input.id.substr( input.id.indexOf('-') + 1 ) ] = input.value;
			});

			// save settings ...
			browser.storage.sync.set({

				// styles ...
				console_substitution_styles: console_substitution_styles,
				// display url and log type (log|group|groupCollapsed) ...
				display_data_url: display_data_url_checkbox.checked,
				display_url_logtype: document.querySelector("#display_url_logtype").value,
				// inject request headers and request types list
				inject_req_headers: inject_req_headers_checkbox.checked,
				inject_req_headers_for_types: document.querySelector('input#inject_req_headers_for_types').value.split(/\s*,\s*/),

			})
			.then(() => showMessage("Options saved!"))
			.catch(error => {
				console.error(error);
				showMessage("Error: " + error.message, "error");
			});

		}

	});


});

