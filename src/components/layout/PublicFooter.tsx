import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Facebook, Instagram, GraduationCap } from 'lucide-react';

export default function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-sky-600 rounded-xl flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-playfair font-bold text-white text-lg leading-none">Maximus Academy</p>
                <p className="text-sky-400 text-xs font-semibold tracking-wider uppercase mt-0.5">Empowering Learners</p>
              </div>
            </Link>
            <p className="text-sm text-slate-400 leading-relaxed mb-5">
              Empowering Learners for Global Success. We offer expert-led courses in language proficiency, test preparation, and professional skills development.
            </p>
            <ul className="space-y-3 mb-6">
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                <span className="text-sm text-slate-400">Building 33, Level 4, Suite 4A, Shah Makhdum Avenue,<br />Sector-12, Uttara, Dhaka, Bangladesh, 1230</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-sky-400 shrink-0" />
                <a href="tel:+8801321203140" className="text-sm text-slate-400 hover:text-white transition-colors">+88 01321-203140</a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-sky-400 shrink-0" />
                <a href="mailto:info@maximusacademy.edu" className="text-sm text-slate-400 hover:text-white transition-colors">info@maximusacademy.edu</a>
              </li>
            </ul>
            <div className="flex gap-3">
              <a href="#" className="w-9 h-9 bg-slate-800 hover:bg-sky-600 rounded-lg flex items-center justify-center transition-colors group" aria-label="Facebook">
                <Facebook className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
              </a>
              <a href="#" className="w-9 h-9 bg-slate-800 hover:bg-sky-600 rounded-lg flex items-center justify-center transition-colors group" aria-label="Instagram">
                <Instagram className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-white font-bold mb-5 text-sm uppercase tracking-wider">Quick Links</h4>
            <ul className="space-y-3">
              {[
                { label: 'Home', href: '/' },
                { label: 'About Us', href: '/about' },
                { label: 'Our Mission', href: '/our-mission' },
                { label: 'Our Courses', href: '/courses' },
                { label: 'Contact Us', href: '/contact' },
                { label: 'Book Online', href: '/book-online' },
              ].map(link => (
                <li key={link.href}>
                  <Link to={link.href} className="text-sm text-slate-400 hover:text-white transition-colors">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-5 text-sm uppercase tracking-wider">Our Courses</h4>
            <ul className="space-y-3">
              {[
                'IELTS Preparation',
                'PTE Academic Preparation',
                'Japanese Language Course',
                'French Language Course',
                'Spanish Language Course',
                'Xero Beginner Course',
                'Test Preparation',
                'Short Courses & Workshops',
              ].map(course => (
                <li key={course}>
                  <Link to="/courses" className="text-sm text-slate-400 hover:text-white transition-colors">{course}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-5 text-sm uppercase tracking-wider">Support</h4>
            <ul className="space-y-3 mb-6">
              {[
                { label: 'Why Choose Us', href: '/about' },
                { label: 'FAQs', href: '/contact' },
                { label: 'Student Portal', href: '/student' },
                { label: 'Verify Certificate', href: '/verify' },
                { label: 'Notifications', href: '/notifications' },
              ].map(link => (
                <li key={link.label}>
                  <Link to={link.href} className="text-sm text-slate-400 hover:text-white transition-colors">{link.label}</Link>
                </li>
              ))}
            </ul>
            <h4 className="text-white font-bold mb-4 text-sm uppercase tracking-wider">Policies</h4>
            <ul className="space-y-3">
              {['Privacy Policy', 'Terms of Service', 'Refund Policy'].map(item => (
                <li key={item}>
                  <a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">{item}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="py-6 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">&copy; {currentYear} Maximus Academy. All rights reserved.</p>
          <p className="text-sm text-slate-500">Empowering Learners for Global Success</p>
        </div>
      </div>
    </footer>
  );
}
