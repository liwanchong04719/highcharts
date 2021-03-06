/**
 * (c) 2010-2017 Torstein Honsi
 *
 * License: www.highcharts.com/license
 */
'use strict';
import H from './Globals.js';
import './Utilities.js';
import './ColumnSeries.js';
import './CenteredSeriesMixin.js';
import './Legend.js';
import './Options.js';
import './Point.js';
import './Series.js';
var addEvent = H.addEvent,
	CenteredSeriesMixin = H.CenteredSeriesMixin,
	defined = H.defined,
	each = H.each,
	extend = H.extend,
	inArray = H.inArray,
	LegendSymbolMixin = H.LegendSymbolMixin,
	noop = H.noop,
	pick = H.pick,
	Point = H.Point,
	Series = H.Series,
	seriesType = H.seriesType,
	seriesTypes = H.seriesTypes,
	setAnimation = H.setAnimation;

/**
 * The pie series type.
 *
 * @constructor seriesTypes.pie
 * @augments Series
 */
seriesType('pie', 'line', {
	center: [null, null],
	clip: false,
	colorByPoint: true, // always true for pies
	dataLabels: {
		// align: null,
		// connectorWidth: 1,
		// connectorColor: point.color,
		// connectorPadding: 5,
		distance: 30, // docs: now also on individual pie points
		enabled: true,
		formatter: function () { // #2945
			return this.point.isNull ? undefined : this.point.name;
		},
		// softConnector: true,
		x: 0
		// y: 0
	},
	ignoreHiddenPoint: true,
	//innerSize: 0,
	legendType: 'point',
	marker: null, // point options are specified in the base options
	size: null,
	showInLegend: false,
	slicedOffset: 10,
	stickyTracking: false,
	tooltip: {
		followPointer: true
	},
	/*= if (build.classic) { =*/
	borderColor: '${palette.backgroundColor}',
	borderWidth: 1,
	states: {
		hover: {
			brightness: 0.1,
			shadow: false
		}
	}
	/*= } =*/

}, /** @lends seriesTypes.pie.prototype */ {
	isCartesian: false,
	requireSorting: false,
	directTouch: true,
	noSharedTooltip: true,
	trackerGroups: ['group', 'dataLabelsGroup'],
	axisTypes: [],
	pointAttribs: seriesTypes.column.prototype.pointAttribs,
	/**
	 * Animate the pies in
	 */
	animate: function (init) {
		var series = this,
			points = series.points,
			startAngleRad = series.startAngleRad;

		if (!init) {
			each(points, function (point) {
				var graphic = point.graphic,
					args = point.shapeArgs;

				if (graphic) {
					// start values
					graphic.attr({
						r: point.startR || (series.center[3] / 2), // animate from inner radius (#779)
						start: startAngleRad,
						end: startAngleRad
					});

					// animate
					graphic.animate({
						r: args.r,
						start: args.start,
						end: args.end
					}, series.options.animation);
				}
			});

			// delete this function to allow it only once
			series.animate = null;
		}
	},

	/**
	 * Recompute total chart sum and update percentages of points.
	 */
	updateTotals: function () {
		var i,
			total = 0,
			points = this.points,
			len = points.length,
			point,
			ignoreHiddenPoint = this.options.ignoreHiddenPoint;

		// Get the total sum
		for (i = 0; i < len; i++) {
			point = points[i];
			total += (ignoreHiddenPoint && !point.visible) ?
				0 :
				point.isNull ? 0 : point.y;
		}
		this.total = total;

		// Set each point's properties
		for (i = 0; i < len; i++) {
			point = points[i];
			point.percentage = (total > 0 && (point.visible || !ignoreHiddenPoint)) ? point.y / total * 100 : 0;
			point.total = total;
		}
	},

	/**
	 * Extend the generatePoints method by adding total and percentage properties to each point
	 */
	generatePoints: function () {
		Series.prototype.generatePoints.call(this);
		this.updateTotals();
	},

	/**
	 * Do translation for pie slices
	 */
	translate: function (positions) {
		this.generatePoints();

		var series = this,
			cumulative = 0,
			precision = 1000, // issue #172
			options = series.options,
			slicedOffset = options.slicedOffset,
			connectorOffset = slicedOffset + (options.borderWidth || 0),
			finalConnectorOffset,
			start,
			end,
			angle,
			startAngle = options.startAngle || 0,
			startAngleRad = series.startAngleRad = Math.PI / 180 * (startAngle - 90),
			endAngleRad = series.endAngleRad = Math.PI / 180 * ((pick(options.endAngle, startAngle + 360)) - 90),
			circ = endAngleRad - startAngleRad, //2 * Math.PI,
			points = series.points,
			radiusX, // the x component of the radius vector for a given point
			radiusY,
			labelDistance = options.dataLabels.distance,
			ignoreHiddenPoint = options.ignoreHiddenPoint,
			i,
			len = points.length,
			point;

		// Get positions - either an integer or a percentage string must be given.
		// If positions are passed as a parameter, we're in a recursive loop for adjusting
		// space for data labels.
		if (!positions) {
			series.center = positions = series.getCenter();
		}

		// Utility for getting the x value from a given y, used for anticollision
		// logic in data labels.
		// Added point for using specific points' label distance.
		series.getX = function (y, left, point) {
			angle = Math.asin(Math.min((y - positions[1]) / (positions[2] / 2 + point.labelDistance), 1));
			return positions[0] +
				(left ? -1 : 1) *
				(Math.cos(angle) * (positions[2] / 2 + point.labelDistance));
		};

		// Calculate the geometry for each point
		for (i = 0; i < len; i++) {

			point = points[i];

			// Used for distance calculation for specific point.
			point.labelDistance = pick(
				point.options.dataLabels && point.options.dataLabels.distance,
				labelDistance
			);

			// Saved for later dataLabels distance calculation.
			series.maxLabelDistance = Math.max(series.maxLabelDistance || 0, point.labelDistance);

			// set start and end angle
			start = startAngleRad + (cumulative * circ);
			if (!ignoreHiddenPoint || point.visible) {
				cumulative += point.percentage / 100;
			}
			end = startAngleRad + (cumulative * circ);

			// set the shape
			point.shapeType = 'arc';
			point.shapeArgs = {
				x: positions[0],
				y: positions[1],
				r: positions[2] / 2,
				innerR: positions[3] / 2,
				start: Math.round(start * precision) / precision,
				end: Math.round(end * precision) / precision
			};

			// The angle must stay within -90 and 270 (#2645)
			angle = (end + start) / 2;
			if (angle > 1.5 * Math.PI) {
				angle -= 2 * Math.PI;
			} else if (angle < -Math.PI / 2) {
				angle += 2 * Math.PI;
			}

			// Center for the sliced out slice
			point.slicedTranslation = {
				translateX: Math.round(Math.cos(angle) * slicedOffset),
				translateY: Math.round(Math.sin(angle) * slicedOffset)
			};

			// set the anchor point for tooltips
			radiusX = Math.cos(angle) * positions[2] / 2;
			radiusY = Math.sin(angle) * positions[2] / 2;
			point.tooltipPos = [
				positions[0] + radiusX * 0.7,
				positions[1] + radiusY * 0.7
			];
			
			point.half = angle < -Math.PI / 2 || angle > Math.PI / 2 ? 1 : 0;
			point.angle = angle;

			// Set the anchor point for data labels. Use point.labelDistance 
			// instead of labelDistance // #1174
			// finalConnectorOffset - not override connectorOffset value.
			finalConnectorOffset = Math.min(connectorOffset, point.labelDistance / 5); // #1678
			point.labelPos = [
				positions[0] + radiusX + Math.cos(angle) * point.labelDistance, // first break of connector
				positions[1] + radiusY + Math.sin(angle) * point.labelDistance, // a/a
				positions[0] + radiusX + Math.cos(angle) * finalConnectorOffset, // second break, right outside pie
				positions[1] + radiusY + Math.sin(angle) * finalConnectorOffset, // a/a
				positions[0] + radiusX, // landing point for connector
				positions[1] + radiusY, // a/a
				point.labelDistance < 0 ? // alignment
					'center' :
					point.half ? 'right' : 'left', // alignment
				angle // center angle
			];

		}
	},

	drawGraph: null,

	/**
	 * Draw the data points
	 */
	drawPoints: function () {
		var series = this,
			chart = series.chart,
			renderer = chart.renderer,
			groupTranslation,
			//center,
			graphic,
			//group,
			pointAttr,
			shapeArgs;

		/*= if (build.classic) { =*/
		var shadow = series.options.shadow;
		if (shadow && !series.shadowGroup) {
			series.shadowGroup = renderer.g('shadow')
				.add(series.group);
		}
		/*= } =*/

		// draw the slices
		each(series.points, function (point) {
			if (!point.isNull) {
				graphic = point.graphic;
				shapeArgs = point.shapeArgs;


				// If the point is sliced, use special translation, else use
				// plot area traslation
				groupTranslation = point.getTranslate();

				/*= if (build.classic) { =*/
				// Put the shadow behind all points
				var shadowGroup = point.shadowGroup;
				if (shadow && !shadowGroup) {
					shadowGroup = point.shadowGroup = renderer.g('shadow')
						.add(series.shadowGroup);
				}

				if (shadowGroup) {
					shadowGroup.attr(groupTranslation);
				}
				pointAttr = series.pointAttribs(point, point.selected && 'select');
				/*= } =*/

				// Draw the slice
				if (graphic) {
					graphic
						.setRadialReference(series.center)
						/*= if (build.classic) { =*/
						.attr(pointAttr)
						/*= } =*/
						.animate(extend(shapeArgs, groupTranslation));
				} else {

					point.graphic = graphic = renderer[point.shapeType](shapeArgs)
						.setRadialReference(series.center)
						.attr(groupTranslation)
						.add(series.group);

					if (!point.visible) {
						graphic.attr({ visibility: 'hidden' });
					}

					/*= if (build.classic) { =*/
					graphic
						.attr(pointAttr)
						.attr({ 'stroke-linejoin': 'round' })
						.shadow(shadow, shadowGroup);
					/*= } =*/
				}

				graphic.addClass(point.getClassName());
						
			}
		});

	},


	searchPoint: noop,

	/**
	 * Utility for sorting data labels
	 */
	sortByAngle: function (points, sign) {
		points.sort(function (a, b) {
			return a.angle !== undefined && (b.angle - a.angle) * sign;
		});
	},

	/**
	 * Use a simple symbol from LegendSymbolMixin
	 */
	drawLegendSymbol: LegendSymbolMixin.drawRectangle,

	/**
	 * Use the getCenter method from drawLegendSymbol
	 */
	getCenter: CenteredSeriesMixin.getCenter,

	/**
	 * Pies don't have point marker symbols
	 */
	getSymbol: noop


/**
 * @constructor seriesTypes.pie.prototype.pointClass
 * @extends {Point}
 */
}, /** @lends seriesTypes.pie.prototype.pointClass.prototype */ {
	/**
	 * Initiate the pie slice
	 */
	init: function () {

		Point.prototype.init.apply(this, arguments);

		var point = this,
			toggleSlice;

		point.name = pick(point.name, 'Slice');

		// add event listener for select
		toggleSlice = function (e) {
			point.slice(e.type === 'select');
		};
		addEvent(point, 'select', toggleSlice);
		addEvent(point, 'unselect', toggleSlice);

		return point;
	},

	/**
	 * Negative points are not valid (#1530, #3623, #5322)
	 */
	isValid: function () {
		return this.y >= 0;
	},

	/**
	 * Toggle the visibility of the pie slice
	 * @param {Boolean} vis Whether to show the slice or not. If undefined, the
	 *    visibility is toggled
	 */
	setVisible: function (vis, redraw) {
		var point = this,
			series = point.series,
			chart = series.chart,
			ignoreHiddenPoint = series.options.ignoreHiddenPoint;

		redraw = pick(redraw, ignoreHiddenPoint);

		if (vis !== point.visible) {

			// If called without an argument, toggle visibility
			point.visible = point.options.visible = vis = vis === undefined ? !point.visible : vis;
			series.options.data[inArray(point, series.data)] = point.options; // update userOptions.data

			// Show and hide associated elements. This is performed regardless of redraw or not,
			// because chart.redraw only handles full series.
			each(['graphic', 'dataLabel', 'connector', 'shadowGroup'], function (key) {
				if (point[key]) {
					point[key][vis ? 'show' : 'hide'](true);
				}
			});

			if (point.legendItem) {
				chart.legend.colorizeItem(point, vis);
			}

			// #4170, hide halo after hiding point
			if (!vis && point.state === 'hover') {
				point.setState('');
			}

			// Handle ignore hidden slices
			if (ignoreHiddenPoint) {
				series.isDirty = true;
			}

			if (redraw) {
				chart.redraw();
			}
		}
	},

	/**
	 * Set or toggle whether the slice is cut out from the pie
	 * @param {Boolean} sliced When undefined, the slice state is toggled
	 * @param {Boolean} redraw Whether to redraw the chart. True by default.
	 */
	slice: function (sliced, redraw, animation) {
		var point = this,
			series = point.series,
			chart = series.chart;

		setAnimation(animation, chart);

		// redraw is true by default
		redraw = pick(redraw, true);

		// if called without an argument, toggle
		point.sliced = point.options.sliced = sliced = defined(sliced) ? sliced : !point.sliced;
		series.options.data[inArray(point, series.data)] = point.options; // update userOptions.data

		point.graphic.animate(this.getTranslate());
		
		/*= if (build.classic) { =*/
		if (point.shadowGroup) {
			point.shadowGroup.animate(this.getTranslate());
		}
		/*= } =*/
	},

	getTranslate: function () {
		return this.sliced ? this.slicedTranslation : {
			translateX: 0,
			translateY: 0
		};
	},

	haloPath: function (size) {
		var shapeArgs = this.shapeArgs;

		return this.sliced || !this.visible ? 
			[] :
			this.series.chart.renderer.symbols.arc(
				shapeArgs.x,
				shapeArgs.y,
				shapeArgs.r + size,
				shapeArgs.r + size, {
					innerR: this.shapeArgs.r,
					start: shapeArgs.start,
					end: shapeArgs.end
				}
			);
	}
});
