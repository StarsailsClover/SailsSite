import PageFrame from "@/components/PageFrame";
import { useSiteText } from "@/hooks/useSiteText";

export default function About() {
  const text = useSiteText();
  return (
    <PageFrame eyebrow={text.about.eyebrow} title={text.about.title}>
      <section className="about-text">
        <p>{text.about.lead}</p>
      </section>
      <div className="timeline">
        {text.about.timeline.map((item) => (
          <div className="timeline-item" key={item.label}>
            <span>{item.label}</span>
            <p>{item.text}</p>
          </div>
        ))}
      </div>
      <section className="about-focus">
        {text.about.focus.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <p>{item.text}</p>
          </article>
        ))}
      </section>
      <section className="about-stack" aria-label="技术栈">
        {text.about.stack.map((item) => <span key={item}>{item}</span>)}
      </section>
    </PageFrame>
  );
}
