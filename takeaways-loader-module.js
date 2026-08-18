/**
 * WinFuture takeaways bar ("Das Wichtigste in Kuerze"), loader module.
 *
 * Requirements:
 *	1. The server template renders the bar (#takeaways_bar) right after
 *	   the in-content ad slot, but only when the has_summary flag of the
 *	   news item is set. The header row is complete, the body is empty
 *	   and closed via the central CSS (height:0).
 *	2. The styles live in the central CSS file (takeaways.css).
 *	3. The existing .summary_box stays untouched inside the article
 *	   HTML, so the editorial workflow does not change.
 *
 * Tasks of this module:
 *	1. Copy the bullets from .summary_box into the bar.
 *	2. Remove the old box (plus one following br) right on load, while
 *	   it is still below the viewport. This keeps the change CLS neutral.
 *	3. Enable the button, wire up height animation and character ticker.
 *
 * Error behaviour: if the bar is missing, do nothing (article without a
 * summary or an old cached page). If the box is missing although the bar
 * exists, remove the bar. A one time shift is better than a dead button.
 *
 * Security notes (see Sicherheitsrichtlinie):
 *	- Presentation only, no security function on the client side (#5).
 *	- Every dynamic string is written via textContent, never innerHTML,
 *	  so HTML meta characters stay inert on output (#15, #24).
 *	- Failures stay silent, no state details go to the client (#12).
 *	- The module holds no secrets and no privileged logic (#26).
 *
 * @author mesios
 * @version 2 18.08.2026
 */
( () => {
	'use strict';

	/*
	 * @var object SPEED Animation timing constants in milliseconds
	 */
	const SPEED = {
		char_delay: 5,
		line_stagger: 110,
	};

	/**
	 * Set up the takeaways bar on the current article page.
	 *
	 * @author mesios
	 * @version 2 18.08.2026
	 * @return void
	 */
	function init() {

		/*
		 * @var HTMLElement|null bar Server rendered bar container
		 */
		const bar = document.getElementById( 'takeaways_bar' );

		if( !bar || bar.dataset.ready ) {
			return;
		}

		/*
		 * @var HTMLElement|null old_box Legacy summary box in the article
		 */
		const old_box = document.querySelector( '.summary_box' );

		/*
		 * @var array items Bullet texts taken from the legacy summary box
		 */
		const items = old_box
			? [ ...old_box.querySelectorAll( 'li' ) ]
				.map( ( li ) => li.textContent.trim() )
				.filter( Boolean )
			: [];

		if( !items.length ) {
			bar.remove();

			return;
		}

		// Child elements of the bar, all rendered by the server template
		const head = bar.querySelector( '.takeaways_head' );
		const body = bar.querySelector( '.takeaways_body' );
		const list = body ? body.querySelector( 'ul' ) : null;
		const toggle = bar.querySelector( '.takeaways_toggle' );

		if( !head || !body || !list || !toggle ) {
			return;
		}

		/*
		 * @var string label_show Toggle label while the bar is closed
		 */
		const label_show = toggle.textContent;

		/*
		 * @var string label_hide Toggle label while the bar is open
		 */
		const label_hide = toggle.dataset.hide || 'Ausblenden';

		/*
		 * @var bool reduce_motion True when the user prefers no motion
		 */
		const reduce_motion =
			matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

		/*
		 * @var bool open Current expanded state of the bar
		 */
		let open = false;

		/*
		 * @var function|null after_transition Finishing step of the height
		 * animation that is currently running, replaced on every click
		 */
		let after_transition = null;

		/*
		 * @var bool ticker_built True once the character spans exist
		 */
		let ticker_built = false;

		// 1) Copy the bullets, textContent keeps meta characters inert
		for( const item of items ) {
			const li = document.createElement( 'li' );

			li.textContent = item;
			list.appendChild( li );
		}

		// 2) Remove the old box plus one directly following br element
		const next_el = old_box.nextElementSibling;

		if( next_el && next_el.tagName === 'BR' ) {
			next_el.remove();
		}

		old_box.remove();

		/**
		 * Wrap the bullet texts into word and character spans and give
		 * every character its transition delay. Runs once, lazily on the
		 * first expand, to keep the initial DOM small.
		 *
		 * @author mesios
		 * @version 2 18.08.2026
		 * @return void
		 */
		function build_ticker() {

			if( ticker_built || reduce_motion ) {
				return;
			}

			ticker_built = true;

			[ ...list.children ].forEach( ( li, line_idx ) => {

				/*
				 * @var string text Plain bullet text of this line
				 */
				const text = li.textContent;

				/*
				 * @var number line_start Delay offset of this line in ms
				 */
				const line_start = line_idx * SPEED.line_stagger;

				/*
				 * @var number i Running character counter of this line
				 */
				let i = 0;

				li.textContent = '';

				// Split kept free of regex escapes on purpose, this keeps
				// the file safe for copy and paste and tooling round trips
				for( const part of text.split( /( +)/ ) ) {

					if( !part ) {
						continue;
					}

					if( part.trim() === '' ) {
						li.appendChild( document.createTextNode( ' ' ) );

						continue;
					}

					// Word wrapper, keeps words unbroken on line wraps
					const word_span = document.createElement( 'span' );

					word_span.className = 'takeaways_w';

					for( const ch of part ) {
						const char_span = document.createElement( 'span' );

						char_span.className = 'takeaways_ch';
						char_span.textContent = ch;
						char_span.style.transitionDelay =
							( line_start + i++ * SPEED.char_delay ) + 'ms';
						word_span.appendChild( char_span );
					}

					li.appendChild( word_span );
				}
			} );
		}

		// One persistent transitionend handler instead of one per click.
		// Stale handlers of interrupted animations otherwise reset the
		// height afterwards and leave an open but empty body behind.
		body.addEventListener( 'transitionend', ( event ) => {

			if( event.target !== body || event.propertyName !== 'height' ) {
				return;
			}

			/*
			 * @var function|null callback Finishing step to run now
			 */
			const callback = after_transition;

			after_transition = null;

			if( callback ) {
				callback();
			}
		} );

		/**
		 * Expand the bar, start the character ticker and animate the
		 * body from its current height to the content height.
		 *
		 * @author mesios
		 * @version 2 18.08.2026
		 * @return void
		 */
		function expand() {

			if( open ) {
				return;
			}

			open = true;

			build_ticker();
			head.setAttribute( 'aria-expanded', 'true' );
			toggle.textContent = label_hide;

			// Re-arm the ticker transitions before opening the bar
			bar.classList.remove( 'takeaways_noanim' );
			void body.offsetHeight;
			bar.classList.add( 'takeaways_open' );

			// >>> Analytics hook, measure the open rate, for example:
			// window._paq?.push(
			//	[ 'trackEvent', 'Takeaways', 'open', location.pathname ] );

			if( reduce_motion ) {
				body.style.height = 'auto';
				after_transition = null;

				return;
			}

			body.style.height = body.scrollHeight + 'px';
			after_transition = () => {

				if( open ) {
					body.style.height = 'auto';
				}
			};
		}

		/**
		 * Collapse the bar without a reverse ticker and animate the body
		 * from its current height down to zero.
		 *
		 * @author mesios
		 * @version 2 18.08.2026
		 * @return void
		 */
		function collapse() {

			if( !open ) {
				return;
			}

			open = false;

			head.setAttribute( 'aria-expanded', 'false' );
			toggle.textContent = label_show;
			bar.classList.add( 'takeaways_noanim' );

			// No transition can start from height auto, so fix the value
			if( body.style.height === 'auto' ) {
				body.style.height = body.scrollHeight + 'px';
				void body.offsetHeight;
			}

			bar.classList.remove( 'takeaways_open' );

			if( reduce_motion ) {
				body.style.height = '0';
				after_transition = null;

				return;
			}

			body.style.height = '0';
			after_transition = null;
		}

		head.addEventListener( 'click', () => {

			if( open ) {
				collapse();
			} else {
				expand();
			}
		} );

		// 3) Arm the bar
		head.disabled = false;
		bar.dataset.ready = '1';
	}

	if( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init, { once: true } );
	} else {
		init();
	}
} )();
